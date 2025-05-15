#!/usr/bin/env node

/**
 * Figma Asset Downloader
 *
 * A Node.js tool for downloading and converting Figma assets for mobile projects.
 * This tool allows you to download icons as SVG and convert them to Android vector XML format or iOS PDF format,
 * as well as download images in different resolutions for both platforms.
 */

// Import required dependencies
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const { program } = require('commander');
const yaml = require('js-yaml');
const ora = require('ora');
const sharp = require('sharp');
const svgo = require('svgo');
const svg2vectordrawable = require('svg2vectordrawable');
require('dotenv').config();

// Constants
const API_BASE_URL = 'https://api.figma.com/v1';
const NEW_CONFIG_PATH = '.figma/figma-asset-downloader.config.yaml';
const OLD_CONFIG_PATH = '.figma/asset_download.yaml';

// Platform-specific scales
const ANDROID_DPI_SCALES = {
  ldpi: 0.75,
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4
};

const IOS_SCALES = {
  '1x': 1,
  '2x': 2,
  '3x': 3,
  'ipad_1x': 2,
  'ipad_2x': 3
};

// Get Figma token from environment variable
const FIGMA_TOKEN = process.env.FIGMA_TOKEN;

if (!FIGMA_TOKEN) {
  console.error(chalk.red('Error: Figma token is required'));
  console.log('Please set the FIGMA_TOKEN environment variable');
  console.log('Example: export FIGMA_TOKEN=your_figma_api_token');
  process.exit(1);
}

// Configure the API client
const figmaApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-Figma-Token': FIGMA_TOKEN
  }
});

// Set up command line options
program
  .version('1.2.0')
  .description('Download and convert Figma assets for mobile projects')
  .argument('[componentNames...]', 'Component names to download (e.g., icon/home img/banner)')
  .option('-a, --all', 'Download all components')
  .option('-f, --find-duplicate', 'Find and list all duplicate components')
  .option('-s, --section <section>', 'Download components from a specific section')
  .parse(process.argv);

const componentNames = program.args;
const downloadAll = program.opts().all;
const findDuplicate = program.opts().findDuplicate;
const sectionName = program.opts().section;

// Show help message if no component names are provided and neither --all nor --find-duplicate flags are set
if (componentNames.length === 0 && !downloadAll && !findDuplicate && !sectionName) {
  console.log(chalk.blue('Figma Asset Downloader'));
  console.log(chalk.blue('======================'));
  console.log('\nUsage:');
  console.log('  figma-asset-downloader [options] [componentNames...]');
  console.log('\nOptions:');
  console.log('  -a, --all                Download all components');
  console.log('  -f, --find-duplicate     Find and list all duplicate components');
  console.log('  -s, --section <section>  Download components from a specific section');
  console.log('  -V, --version            Output the version number');
  console.log('  -h, --help               Display help for command');
  console.log('\nExamples:');
  console.log('  figma-asset-downloader icon/home      # Download a specific icon');
  console.log('  figma-asset-downloader img/banner     # Download a specific image');
  console.log('  figma-asset-downloader icon/home img/logo    # Download multiple components');
  console.log('  figma-asset-downloader --all                 # Download all components');
  console.log('  figma-asset-downloader --find-duplicate      # Find and list all duplicate components');
  console.log('  figma-asset-downloader --section="Section Name" # Download components from a specific section');
  process.exit(0);
}

/**
 * Find and report duplicate components
 */
async function findDuplicateComponents(fileId, pageId = '', pageName = '') {
  const spinner = ora('Fetching components from Figma to find duplicates...').start();

  try {
    // Get the file data from Figma API
    const response = await figmaApi.get(`/files/${fileId}`);
    const fileData = response.data;

    // Extract all components, filtered by page ID or page name if provided
    const allComponents = extractComponents(fileData, pageId, pageName);

    // Filter to only include icon/ and img/ components
    const relevantComponents = allComponents.filter(component =>
      component.name.startsWith('icon/') || component.name.startsWith('img/')
    );

    spinner.succeed(`Found ${relevantComponents.length} icon and image components`);

    // Group components by name to find duplicates
    const componentsByName = new Map();
    relevantComponents.forEach(component => {
      if (!componentsByName.has(component.name)) {
        componentsByName.set(component.name, []);
      }
      componentsByName.get(component.name).push(component);
    });

    // Filter to only include names with multiple components (duplicates)
    const duplicates = new Map();
    componentsByName.forEach((components, name) => {
      if (components.length > 1) {
        duplicates.set(name, components);
      }
    });

    // Report results
    if (duplicates.size === 0) {
      console.log(chalk.green('\nNo duplicate components found!'));
    } else {
      console.log(chalk.red(`\nFound ${duplicates.size} component names with duplicates:`));

      duplicates.forEach((components, name) => {
        console.log(chalk.red(`\n${name} (${components.length} duplicates):`));

        // Print links to the Figma file with the duplicated components focused
        components.forEach((component, index) => {
          const figmaLink = `https://www.figma.com/file/${fileId}?node-id=${encodeURIComponent(component.id)}`;
          console.log(chalk.cyan(`  ${index + 1}. ${component.path} - ${figmaLink}`));
        });
      });

      console.log(chalk.yellow('\nPlease rename these components to ensure they have unique names.'));
    }

    return duplicates.size > 0;
  } catch (error) {
    spinner.fail('Error fetching components from Figma');
    handleApiError(error);
    process.exit(1);
  }
}

/**
 * Load configuration from YAML file
 */
function loadConfig() {
  try {
    let configFile;

    // First try to read from the new path (.figma/figma-asset-downloader.config.yaml)
    if (fs.existsSync(NEW_CONFIG_PATH)) {
      configPath = NEW_CONFIG_PATH;
      configFile = fs.readFileSync(NEW_CONFIG_PATH, 'utf8');
      console.log(chalk.green(`Using configuration file from: ${NEW_CONFIG_PATH}`));
    }
    // If not found, try the old path (.figma/asset_download.yaml)
    else if (fs.existsSync(OLD_CONFIG_PATH)) {
      configPath = OLD_CONFIG_PATH;
      configFile = fs.readFileSync(OLD_CONFIG_PATH, 'utf8');
      console.log(chalk.green(`Using configuration file from: ${OLD_CONFIG_PATH}`));
    }
    // If neither exists, show error
    else {
      console.error(chalk.red(`Error: Configuration file not found at ${NEW_CONFIG_PATH} or ${OLD_CONFIG_PATH}`));
      console.log('Please create a configuration file as described in the README');
      process.exit(1);
    }

    const config = yaml.load(configFile);

    // Validate required configuration
    if (!config.fileId) {
      console.error(chalk.red('Error: fileId is required in the configuration file'));
      process.exit(1);
    }

    if (!config.platform) {
      console.error(chalk.red('Error: platform is required in the configuration file'));
      process.exit(1);
    }

    if (!['android', 'ios'].includes(config.platform)) {
      console.error(chalk.red('Error: platform must be either "android" or "ios"'));
      process.exit(1);
    }

    // Set default values if not provided
    // pageId can be a string or an array of strings
    if (!config.pageId) {
      config.pageId = '';  // Empty string means search the entire file
    }
    
    // pageName can be a string or an array of strings
    if (!config.pageName) {
      config.pageName = '';  // Empty string means search the entire file
    }

    // Set platform-specific defaults
    if (config.platform === 'android') {
      if (!config.icons) {
        config.icons = { path: 'res' };
      }

      if (!config.icons.prefix) {
        config.icons.prefix = 'ic_';
      }

      if (!config.images) {
        config.images = { path: 'res', format: 'webp', quality: 90 };
      }

      if (!config.images.format) {
        config.images.format = 'webp';
      }

      if (!config.images.quality) {
        config.images.quality = 90;
      }

      if (!config.images.prefix) {
        config.images.prefix = 'img_';
      }
    } else { // iOS
      if (!config.icons) {
        config.icons = {};
      }

      if (!config.icons.path) {
        config.icons.path = 'Assets.xcassets';
      }

      if (!config.icons.prefix) {
        config.icons.prefix = '';
      }

      if (!config.images) {
        config.images = {};
      }

      if (!config.images.path) {
        config.images.path = 'Assets.xcassets';
      }

      if (!config.images.format) {
        config.images.format = 'png';
      }

      if (!config.images.quality) {
        config.images.quality = 90;
      }

      if (!config.images.prefix) {
        config.images.prefix = '';
      }
    }

    return config;
  } catch (error) {
    console.error(chalk.red('Error loading configuration:'), error.message);
    process.exit(1);
  }
}

/**
 * Fetch components from Figma file
 */
async function fetchComponents(fileId, componentNames, pageId = '', pageName = '') {
  const spinner = ora('Fetching components from Figma...').start();

  try {
    // Get the file data from Figma API
    const response = await figmaApi.get(`/files/${fileId}`);
    const fileData = response.data;

    // Extract components from the file, filtered by page ID or page name if provided
    const allComponents = extractComponents(fileData, pageId, pageName);

    // Filter components by name if componentNames are provided and --all flag is not set
    let filteredComponents = allComponents;

    // Filter by section if section name is provided
    if (sectionName) {
      filteredComponents = allComponents.filter(component => {
        // Check if the component path contains the section name
        return component.path.includes(sectionName);
      });

      if (filteredComponents.length === 0) {
        spinner.fail(`No components found in section: ${sectionName}`);
        process.exit(1);
      }

      spinner.succeed(`Found ${filteredComponents.length} components in section: ${sectionName}`);
    }

    if (componentNames && componentNames.length > 0) {
      // Check for duplicate component names
      const nameMap = new Map();
      const duplicates = new Map();

      // First, find all exact matches and identify duplicates
      componentNames.forEach(requestedName => {
        const exactMatches = allComponents.filter(component => component.name === requestedName);

        if (exactMatches.length > 1) {
          // Store duplicates for error reporting
          duplicates.set(requestedName, exactMatches);
        } else if (exactMatches.length === 1) {
          // Store single matches
          nameMap.set(requestedName, exactMatches[0]);
        }
      });

      // Handle duplicates if any
      if (duplicates.size > 0) {
        spinner.fail('Found duplicate components with the same name');

        duplicates.forEach((components, name) => {
          console.error(chalk.red(`Error: Multiple components found with the exact name "${name}"`));
          console.error(chalk.red(`Cannot download because of ambiguity. Please rename components to be unique.`));

          // Print links to the Figma file with the duplicated components focused
          console.log(chalk.yellow('\nLinks to duplicated components:'));
          components.forEach((component, index) => {
            const figmaLink = `https://www.figma.com/file/${fileId}?node-id=${encodeURIComponent(component.id)}`;
            console.log(chalk.cyan(`${index + 1}. ${component.path} - ${figmaLink}`));
          });
        });

        process.exit(1);
      }

      // Filter to only include exact matches
      filteredComponents = Array.from(nameMap.values());
    } else if (!downloadAll && !sectionName) {
      // This case should not happen due to the help message check at the beginning,
      // but we'll keep it as a safeguard
      spinner.fail('No component names provided. Use --all flag to download all components or --section to specify a section.');
      process.exit(1);
    }

    if (filteredComponents.length === 0) {
      spinner.fail('No components found matching the provided names exactly');
      process.exit(1);
    }

    spinner.succeed(`Found ${filteredComponents.length} components with exact name matches`);
    return filteredComponents;
  } catch (error) {
    spinner.fail('Error fetching components from Figma');
    handleApiError(error);
    process.exit(1);
  }
}

/**
 * Extract components from the Figma file data
 */
function extractComponents(fileData, pageId = '', pageName = '') {
  const components = [];
  const componentSets = new Map();
  
  // Start with the document as the root node
  let rootNode = fileData.document;
  let foundPages = [];
  
  // Convert pageId and pageName to arrays if they're strings
  const pageIds = Array.isArray(pageId) ? pageId : (pageId ? [pageId] : []);
  const pageNames = Array.isArray(pageName) ? pageName : (pageName ? [pageName] : []);
  
  // Only search for specific pages if pageIds or pageNames are provided
  if (pageIds.length > 0 || pageNames.length > 0) {
    // Find pages that match either the ID or name
    const findPages = (node) => {
      const matchedPages = [];
      
      // Check if this node is a page that matches our criteria
      if (node.type === 'CANVAS') {
        const idMatch = pageIds.includes(node.id);
        const nameMatch = pageNames.includes(node.name);
        
        if (idMatch || nameMatch) {
          matchedPages.push(node);
          if (idMatch) {
            console.log(chalk.green(`Found page with ID: ${node.id} (${node.name})`));
          }
          if (nameMatch) {
            console.log(chalk.green(`Found page with name: ${node.name} (${node.id})`));
          }
        }
      }
      
      // Recursively check children
      if (node.children) {
        for (const child of node.children) {
          const childMatches = findPages(child);
          matchedPages.push(...childMatches);
        }
      }
      
      return matchedPages;
    };
    
    foundPages = findPages(rootNode);
    
    if (foundPages.length > 0) {
      console.log(chalk.green(`Found ${foundPages.length} matching pages`));
    } else {
      console.log(chalk.yellow(`Warning: No pages found matching the specified criteria. Searching the entire file instead.`));
    }
  }

  // Process each found page or the entire document if no pages were found
  const nodesToProcess = foundPages.length > 0 ? foundPages : [rootNode];
  
  // First pass: collect component sets from all matching pages
  for (const node of nodesToProcess) {
    traverseNode(node, (node, path) => {
      if (node.type === 'COMPONENT_SET') {
        componentSets.set(node.id, {
          node,
          path
        });
      }
    });
  }

  // Second pass: collect components from all matching pages
  for (const node of nodesToProcess) {
    traverseNode(node, (node, path) => {
      if (node.type === 'COMPONENT') {
        // Check if this component is part of a component set
        let parentComponentSet = null;
        if (node.componentSetId) {
          const componentSetInfo = componentSets.get(node.componentSetId);
          if (componentSetInfo) {
            parentComponentSet = {
              id: node.componentSetId,
              name: componentSetInfo.node.name,
              path: componentSetInfo.path
            };
          }
        }

        components.push({
          id: node.id,
          name: node.name,
          path: path.join(' / '),
          type: node.type,
          description: node.description || '',
          width: node.absoluteBoundingBox ? node.absoluteBoundingBox.width : null,
          height: node.absoluteBoundingBox ? node.absoluteBoundingBox.height : null,
          componentSetId: node.componentSetId || null,
          componentSet: parentComponentSet
        });
      }
    });
  }

  return components;
}

/**
 * Traverse the Figma document tree recursively
 */
function traverseNode(node, callback, path = [], depth = 0) {
  // Skip nodes without a name or with names starting with '#'
  if (!node.name || node.name.startsWith('#')) {
    return;
  }

  const currentPath = [...path, node.name];

  // Call the callback for this node
  callback(node, currentPath, depth);

  // Recursively process children
  if (node.children) {
    for (const child of node.children) {
      traverseNode(child, callback, currentPath, depth + 1);
    }
  }
}

/**
 * Get image URLs for components
 */
async function getImageUrls(fileId, components, format = 'svg', scale = 1, platform) {
  try {
    const componentIds = components.map(component => component.id).join(',');
    // Request the highest scale for images to ensure high quality
    const response = await figmaApi.get(`/images/${fileId}?ids=${componentIds}&format=${format}&scale=${scale}`);

    if (!response.data.images) {
      throw new Error(`No image URLs returned from Figma API (format: ${format}, scale: ${scale})`);
    }

    return response.data.images;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}

/**
 * Download an SVG file from a URL
 */
async function downloadSvg(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(chalk.red(`Error downloading SVG: ${error.message}`));
    throw error;
  }
}

/**
 * Optimize SVG content
 */
async function optimizeSvg(svgContent) {
  try {
    const result = await svgo.optimize(svgContent, {
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              cleanupIds: false,
              removeViewBox: false
            }
          }
        }
      ]
    });
    return result.data;
  } catch (error) {
    console.error(chalk.red(`Error optimizing SVG: ${error.message}`));
    return svgContent; // Return original content if optimization fails
  }
}

/**
 * Convert SVG to platform-specific format
 */
async function convertSvgForPlatform(svgContent, platform) {
  try {
    if (platform === 'android') {
      // Convert to Android vector drawable
      const options = {
        xmlTag: true,
        fillBlack: false
      };

      const xmlContent = await svg2vectordrawable(svgContent, options);
      return xmlContent;
    } else {
      // For iOS, keep the optimized SVG
      return svgContent;
    }
  } catch (error) {
    console.error(chalk.red(`Error converting SVG for ${platform}: ${error.message}`));
    throw error;
  }
}

/**
 * Download an image from a URL
 */
async function downloadImage(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary');
  } catch (error) {
    console.error(chalk.red(`Error downloading image: ${error.message}`));
    throw error;
  }
}

/**
 * Create Contents.json for iOS assets
 */
function createContentsJson(name, format = 'png') {
  if (format === 'svg') {
    return JSON.stringify({
      images: [
        {
          filename: `${name}.${format}`,
          idiom: 'universal'
        }
      ],
      info: {
        author: 'Figma Asset Downloader',
        version: 1
      },
      properties: {
        "template-rendering-intent": "original"
      }
    }, null, 2);
  }

  return JSON.stringify({
    images: [
      {
        filename: `${name}.${format}`,
        idiom: 'universal',
        scale: '1x'
      },
      {
        filename: `${name}@2x.${format}`,
        idiom: 'universal',
        scale: '2x'
      },
      {
        filename: `${name}@3x.${format}`,
        idiom: 'universal',
        scale: '3x'
      },
      {
        filename: `${name}~ipad.${format}`,
        idiom: 'ipad',
        scale: '1x'
      },
      {
        filename: `${name}~ipad@2x.${format}`,
        idiom: 'ipad',
        scale: '2x'
      }
    ],
    info: {
      version: 1,
      author: 'xcode'
    },
    properties: {
      "template-rendering-intent": "original"
    }
  }, null, 2);
}

/**
 * Handle API errors
 */
function handleApiError(error) {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.error(chalk.red(`Status: ${error.response.status}`));
    console.error(chalk.red(`Message: ${JSON.stringify(error.response.data)}`));

    if (error.response.status === 403) {
      console.error(chalk.yellow('This might be due to an invalid Figma token or insufficient permissions.'));
    } else if (error.response.status === 404) {
      console.error(chalk.yellow('The Figma file could not be found.'));
      console.error(chalk.yellow('Make sure the file ID is correct and that you have access to this file.'));
    }
  } else if (error.request) {
    // The request was made but no response was received
    console.error(chalk.red('No response received from the Figma API.'));
    console.error(chalk.yellow('Please check your internet connection and try again.'));
  } else {
    // Something happened in setting up the request that triggered an Error
    console.error(chalk.red(`Message: ${error.message}`));
  }
}

/**
 * Process and save icons from Figma components
 */
async function processIcons(components, fileId, config) {
  const iconComponents = components.filter(component => component.name.startsWith('icon/'));
  if (iconComponents.length === 0) return [];

  console.log(chalk.yellow(`\nProcessing ${iconComponents.length} icons...`));

  // Get SVG URLs for icons
  const spinner = ora(`Getting image URLs from Figma...`).start();
  let iconUrls;
  try {
    iconUrls = await getImageUrls(fileId, iconComponents, 'svg', 1, config.platform);
    spinner.succeed(`Successfully retrieved image URLs`);
  } catch (error) {
    spinner.fail(`Error getting image URLs from Figma`);
    console.error(chalk.red(error.message));
    return [];
  }

  // Process each icon
  let iconCounter = 0;
  const totalIcons = iconComponents.length;
  const processedComponentNames = new Set();

  for (const component of iconComponents) {
    iconCounter++;
    const imageUrl = iconUrls[component.id];
    if (imageUrl) {
      const spinner = ora(`Processing icon (${iconCounter}/${totalIcons}): ${component.name}`).start();
      try {
        // Extract the icon name from the component name (remove 'icon/' prefix)
        const iconName = component.name.replace('icon/', '');
        const sanitizedName = iconName.replace(/\s+/g, '_').toLowerCase();
        const fileName = `${config.icons.prefix}${sanitizedName}`;

        // Download and process the SVG
        const svgContent = await downloadSvg(imageUrl);
        const optimizedSvg = await optimizeSvg(svgContent);

        if (config.platform === 'android') {
          // Convert to vector drawable XML
          const xmlContent = await convertSvgForPlatform(optimizedSvg, 'android');
          const drawablePath = path.join(config.icons.path, 'drawable');
          await fs.ensureDir(drawablePath);
          const filePath = path.join(drawablePath, `${fileName}.xml`);
          await fs.writeFile(filePath, xmlContent, 'utf8');
        } else {
          // Create asset catalog structure
          const assetPath = path.join(config.icons.path, `${fileName}.imageset`);
          await fs.ensureDir(assetPath);
          await fs.emptyDir(assetPath);

          // Save SVG directly for iOS
          const filePath = path.join(assetPath, `${fileName}.svg`);
          await fs.writeFile(filePath, optimizedSvg, 'utf8');

          // Create Contents.json
          const contentsPath = path.join(assetPath, 'Contents.json');
          const contents = createContentsJson(fileName, config.images.format);
          await fs.writeFile(contentsPath, contents, 'utf8');
        }

        spinner.succeed(`Icon saved (${iconCounter}/${totalIcons}): ${fileName}`);
        processedComponentNames.add(component.name);
      } catch (error) {
        spinner.fail(`Failed to process icon (${iconCounter}/${totalIcons}): ${component.name}`);
        console.error(chalk.red(error.message));
      }
    } else {
      console.error(chalk.red(`No image URL found for icon (${iconCounter}/${totalIcons}): ${component.name}`));
    }
  }

  return processedComponentNames;
}

/**
 * Process and save images from Figma components
 */
async function processImages(components, fileId, config) {
  const imageComponents = components.filter(component => component.name.startsWith('img/'));
  if (imageComponents.length === 0) return [];

  console.log(chalk.yellow(`\nProcessing ${imageComponents.length} images...`));

  // Process each image
  let imageCounter = 0;
  const totalImages = imageComponents.length;
  const processedComponentNames = new Set();

  for (const component of imageComponents) {
    imageCounter++;

    // Extract the image name from the component name (remove 'img/' prefix)
    const imageName = component.name.replace('img/', '');
    const sanitizedName = imageName.replace(/\s+/g, '_').toLowerCase();
    const fileNameBase = `${config.images.prefix}${sanitizedName}`;

    let failed = false;

    if (config.platform === 'android') {
      // Get the list of DPIs to process (exclude any in skipDpi)
      const dpisToProcess = Object.keys(ANDROID_DPI_SCALES).filter(dpi =>
        !config.images.skipDpi || !config.images.skipDpi.includes(dpi)
      );

      // Process for each DPI
      for (const dpi of dpisToProcess) {
        const scale = ANDROID_DPI_SCALES[dpi];
        const spinner = ora(`Processing image (${imageCounter}/${totalImages}): ${component.name} [${dpi}]`).start();
        
        try { 
          const drawablePath = path.join(config.images.path, `drawable-${dpi}`);
          await fs.ensureDir(drawablePath);

          const fileName = `${fileNameBase}.${config.images.format}`;
          const filePath = path.join(drawablePath, fileName);

          // Download the image from Figma at the correct scale
          const imageUrls = await getImageUrls(fileId, [component], 'png', scale, config.platform);
          const imageUrl = imageUrls[component.id];
          if (!imageUrl) {
            spinner.fail(`No image URL found for image (${imageCounter}/${totalImages}) [${dpi}]: ${component.name}`);
            failed = true;
            continue;
          }

          let processedImage = await downloadImage(imageUrl);

          // Convert to WebP if needed
          if (config.images.format === 'webp') {
            processedImage = await sharp(processedImage)
              .webp({ quality: config.images.quality })
              .toBuffer();
          }

          // Save the processed image
          await fs.writeFile(filePath, processedImage);
          spinner.succeed(`Image saved (${imageCounter}/${totalImages}): ${fileNameBase} [${dpi}]`);
        } catch (error) {
          spinner.fail(`Failed to process image (${imageCounter}/${totalImages}): ${component.name} [${dpi}]`);
          console.error(chalk.red(error.message));
          failed = true;
        }
      }
    } else {
      // Create asset catalog structure
      const assetPath = path.join(config.images.path, `${fileNameBase}.imageset`);
      await fs.ensureDir(assetPath);
      await fs.emptyDir(assetPath);

      // Process for each scale (1x, 2x, 3x for universal and 1x, 2x for iPad)
      for (const [scale, factor] of Object.entries(IOS_SCALES)) {
        const spinner = ora(`Processing image (${imageCounter}/${totalImages}): ${component.name} [${scale}]`).start();

        // Download the image from Figma at the correct scale
        const imageUrls = await getImageUrls(fileId, [component], config.images.format, factor, config.platform);
        const imageUrl = imageUrls[component.id];
        if (!imageUrl) {
          console.error(chalk.red(`No image URL found for image (${imageCounter}/${totalImages}) [${scale}]: ${component.name}`));
          failed = true;
          continue;
        }

        let scaleFileName;
        if (scale.startsWith('ipad_')) {
          // Handle iPad-specific scales
          const ipadScale = scale.replace('ipad_', '');
          scaleFileName = ipadScale === '1x' ?
            `${fileNameBase}~ipad` :
            `${fileNameBase}~ipad@${ipadScale}`;
        } else {
          // Handle universal scales
          scaleFileName = scale === '1x' ?
            fileNameBase :
            `${fileNameBase}@${scale}`;
        }

        try {
          const filePath = path.join(assetPath, `${scaleFileName}.${config.images.format}`);
          const processedImage = await downloadImage(imageUrl);
          await fs.writeFile(filePath, processedImage);
          spinner.succeed(`Image saved (${imageCounter}/${totalImages}): ${fileNameBase} [${scale}]`);
        } catch (error) {
          spinner.fail(`Failed to process image (${imageCounter}/${totalImages}): ${component.name} [${scale}]`);
          console.error(chalk.red(error.message));
          failed = true;
        }
      }

      // Create Contents.json
      const contentsPath = path.join(assetPath, 'Contents.json');
      const contents = createContentsJson(fileNameBase, config.images.format);
      await fs.writeFile(contentsPath, contents, 'utf8');
    }

    if (!failed) {
      processedComponentNames.add(component.name);
    }
  }

  return processedComponentNames;
}

/**
 * Main function to run the application
 */
async function main() {
  console.log(chalk.blue('Figma Asset Downloader'));
  console.log(chalk.blue('======================'));

  try {
    // Load configuration
    let config = loadConfig();
    const fileId = config.fileId;
    const pageId = config.pageId;
    const pageName = config.pageName;
    const platform = config.platform;
    console.log(chalk.green(`Loaded configuration for file: ${fileId}`));
    console.log(chalk.green(`Platform: ${platform}`));

    // If --find-duplicate flag is set, find and report duplicate components
    if (findDuplicate) {
      await findDuplicateComponents(fileId, pageId, pageName);
      return;
    }

    // Fetch components
    const components = await fetchComponents(fileId, componentNames, pageId, pageName);

    // Process icons and images
    const processedIconNames = await processIcons(components, fileId, config);
    const processedImageNames = await processImages(components, fileId, config);

    // Combine all processed component names
    const allProcessedComponentNames = new Set([...processedIconNames, ...processedImageNames]);

    // Find unprocessed components
    const unprocessedComponentNames = componentNames.filter(componentName =>
      !allProcessedComponentNames.has(componentName)
    );

    if (unprocessedComponentNames.length > 0) {
      console.log(chalk.red('\nThe following components were not processed:'));
      unprocessedComponentNames.forEach(componentName => {
        const componentExists = components.some(c => c.name === componentName);
        console.log(chalk.red(`- ${componentName}${!componentExists ? ' (not found)' : ''}`));
      });
    }

    console.log(chalk.green('\nAsset download and processing complete!'));
  } catch (error) {
    console.error(chalk.red('An error occurred:'), error.message);
    process.exit(1);
  }
}

// Start the application
main();