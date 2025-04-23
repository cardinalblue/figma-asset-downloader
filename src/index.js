#!/usr/bin/env node

/**
 * Figma Asset Downloader
 * 
 * A Node.js tool for downloading and converting Figma assets for Android projects.
 * This tool allows you to download icons as SVG and convert them to Android vector XML format,
 * as well as download images in different DPI resolutions.
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
const { parse: parseSvg } = require('svgson');
require('dotenv').config();

// Constants
const API_BASE_URL = 'https://api.figma.com/v1';
const CONFIG_PATH = '.figma/asset_download.yaml';
const DPI_SCALES = {
  ldpi: 0.75,
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4
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
  .version('1.0.7')
  .description('Download and convert Figma assets for Android projects')
  .argument('[componentNames...]', 'Component names to download (e.g., icon/home img/banner)')
  .option('-a, --all', 'Download all components')
  .option('-f, --find-duplicate', 'Find and list all duplicate components')
  .parse(process.argv);

const componentNames = program.args;
const downloadAll = program.opts().all;
const findDuplicate = program.opts().findDuplicate;

// Show help message if no component names are provided and neither --all nor --find-duplicate flags are set
if (componentNames.length === 0 && !downloadAll && !findDuplicate) {
  console.log(chalk.blue('Figma Asset Downloader'));
  console.log(chalk.blue('======================'));
  console.log('\nUsage:');
  console.log('  figma-asset-downloader [options] [componentNames...]');
  console.log('\nOptions:');
  console.log('  -a, --all                Download all components');
  console.log('  -f, --find-duplicate     Find and list all duplicate components');
  console.log('  -V, --version            Output the version number');
  console.log('  -h, --help               Display help for command');
  console.log('\nExamples:');
  console.log('  figma-asset-downloader icon/home          # Download a specific icon');
  console.log('  figma-asset-downloader img/banner         # Download a specific image');
  console.log('  figma-asset-downloader icon/home img/logo # Download multiple components');
  console.log('  figma-asset-downloader --all              # Download all components');
  console.log('  figma-asset-downloader --find-duplicate   # Find and list all duplicate components');
  process.exit(0);
}

/**
 * Find and report duplicate components
 */
async function findDuplicateComponents(fileId, pageId = '') {
  const spinner = ora('Fetching components from Figma to find duplicates...').start();

  try {
    // Get the file data from Figma API
    const response = await figmaApi.get(`/files/${fileId}`);
    const fileData = response.data;

    // Extract all components, filtered by page ID if provided
    const allComponents = extractComponents(fileData, pageId);
    
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
    if (!fs.existsSync(CONFIG_PATH)) {
      console.error(chalk.red(`Error: Configuration file not found at ${CONFIG_PATH}`));
      console.log('Please create a configuration file as described in the README');
      process.exit(1);
    }

    const configFile = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = yaml.load(configFile);

    // Validate required configuration
    if (!config.fileId) {
      console.error(chalk.red('Error: fileId is required in the configuration file'));
      process.exit(1);
    }

    // Set default values if not provided
    if (!config.pageId) {
      config.pageId = '';  // Empty string means search the entire file
    }

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

    return config;
  } catch (error) {
    console.error(chalk.red('Error loading configuration:'), error.message);
    process.exit(1);
  }
}

/**
 * Fetch components from Figma file
 */
async function fetchComponents(fileId, componentNames, pageId = '') {
  const spinner = ora('Fetching components from Figma...').start();

  try {
    // Get the file data from Figma API
    const response = await figmaApi.get(`/files/${fileId}`);
    const fileData = response.data;

    // Extract components from the file, filtered by page ID if provided
    const allComponents = extractComponents(fileData, pageId);

    // Filter components by name if componentNames are provided and --all flag is not set
    let filteredComponents = allComponents;
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

      // Check if any requested components were not found
      const notFound = componentNames.filter(name => !nameMap.has(name));
      if (notFound.length > 0) {
        console.log(chalk.yellow(`Warning: The following components were not found: ${notFound.join(', ')}`));
      }
    } else if (!downloadAll) {
      // This case should not happen due to the help message check at the beginning,
      // but we'll keep it as a safeguard
      spinner.fail('No component names provided. Use --all flag to download all components.');
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
function extractComponents(fileData, pageId = '') {
  const components = [];
  const componentSets = new Map();
  
  // Find the specific page if pageId is provided
  let rootNode = fileData.document;
  
  if (pageId) {
    // Find the page with the specified ID
    const findPage = (node) => {
      if (node.id === pageId) {
        return node;
      }
      
      if (node.children) {
        for (const child of node.children) {
          const found = findPage(child);
          if (found) return found;
        }
      }
      
      return null;
    };
    
    const page = findPage(rootNode);
    if (page) {
      rootNode = page;
      console.log(chalk.green(`Found page with ID: ${pageId} (${page.name})`));
    } else {
      console.log(chalk.yellow(`Warning: Page with ID ${pageId} not found. Searching the entire file instead.`));
    }
  }

  // First pass: collect component sets
  traverseNode(rootNode, (node, path) => {
    if (node.type === 'COMPONENT_SET') {
      componentSets.set(node.id, {
        node,
        path
      });
    }
  });

  // Second pass: collect components
  traverseNode(rootNode, (node, path) => {
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
async function getImageUrls(fileId, components, format = 'svg', scale = 1) {
  const spinner = ora('Getting image URLs from Figma...').start();

  try {
    const componentIds = components.map(component => component.id).join(',');
    // Request the highest scale (4x) for images to ensure high quality
    const scaleParam = format === 'png' ? 4 : scale;
    const response = await figmaApi.get(`/images/${fileId}?ids=${componentIds}&format=${format}&scale=${scaleParam}`);

    if (!response.data.images) {
      spinner.fail('No image URLs returned from Figma API');
      process.exit(1);
    }

    spinner.succeed('Successfully retrieved image URLs');
    return response.data.images;
  } catch (error) {
    spinner.fail('Error getting image URLs from Figma');
    handleApiError(error);
    process.exit(1);
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
 * Convert SVG to Android vector drawable XML
 */
async function convertSvgToXml(svgContent) {
  try {
    const options = {
      xmlTag: true,
      fillBlack: false
    };

    const xmlContent = await svg2vectordrawable(svgContent, options);
    return xmlContent;
  } catch (error) {
    console.error(chalk.red(`Error converting SVG to XML: ${error.message}`));
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
 * Process an image for a specific DPI
 */
async function processImageForDpi(imageBuffer, dpi, format, quality, scale) {
  try {
    // Get the metadata to determine original dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;

    // Since we're downloading at 4x (xxxhdpi), calculate the relative scale
    // For example, if we want hdpi (1.5x), we need to scale to 1.5/4 = 0.375 of the original
    const relativeScale = scale / DPI_SCALES.xxxhdpi;

    // Calculate new dimensions based on relative scale
    const newWidth = Math.round(originalWidth * relativeScale);
    const newHeight = Math.round(originalHeight * relativeScale);

    let sharpInstance = sharp(imageBuffer)
      .resize({
        width: newWidth,
        height: newHeight,
        fit: 'contain'
      });

    if (format === 'webp') {
      return await sharpInstance.webp({ quality }).toBuffer();
    } else {
      return await sharpInstance.png({ quality }).toBuffer();
    }
  } catch (error) {
    console.error(chalk.red(`Error processing image for ${dpi}: ${error.message}`));
    throw error;
  }
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
 * Main function to run the application
 */
async function main() {
  console.log(chalk.blue('Figma Asset Downloader'));
  console.log(chalk.blue('======================'));

  try {
    // Load configuration
    const config = loadConfig();
    console.log(chalk.green(`Loaded configuration for file: ${config.fileId}`));

    // If --find-duplicate flag is set, find and report duplicate components
    if (findDuplicate) {
      await findDuplicateComponents(config.fileId, config.pageId);
      return;
    }

    // Fetch components
    const components = await fetchComponents(config.fileId, componentNames, config.pageId);

    // Process icons (components with names starting with "icon/")
    const iconComponents = components.filter(component => component.name.startsWith('icon/'));
    if (iconComponents.length > 0) {
      console.log(chalk.yellow(`\nProcessing ${iconComponents.length} icons...`));

      // Get SVG URLs for icons
      const iconUrls = await getImageUrls(config.fileId, iconComponents, 'svg');

      // Process each icon
      let iconCounter = 0;
      const totalIcons = iconComponents.length;
      for (const component of iconComponents) {
        iconCounter++;
        const imageUrl = iconUrls[component.id];
        if (imageUrl) {
          // Update the spinner message to include progress
          const spinner = ora(`Processing icon (${iconCounter}/${totalIcons}): ${component.name}`).start();
          try {
            // Extract the icon name from the component name (remove 'icon/' prefix)
            const iconName = component.name.replace('icon/', '');
            const sanitizedName = iconName.replace(/\s+/g, '_').toLowerCase();
            const fileName = `${config.icons.prefix}${sanitizedName}.xml`;

            // Create the drawable directory if it doesn't exist
            const drawablePath = path.join(config.icons.path, 'drawable');
            await fs.ensureDir(drawablePath);

            // Download the SVG
            const svgContent = await downloadSvg(imageUrl);

            // Optimize the SVG
            const optimizedSvg = await optimizeSvg(svgContent);

            // Convert SVG to Android vector drawable XML
            const xmlContent = await convertSvgToXml(optimizedSvg);

            // Save the XML file
            const filePath = path.join(drawablePath, fileName);
            await fs.writeFile(filePath, xmlContent, 'utf8');

            spinner.succeed(`Icon saved (${iconCounter}/${totalIcons}): ${filePath}`);
          } catch (error) {
            spinner.fail(`Failed to process icon (${iconCounter}/${totalIcons}): ${component.name}`);
            console.error(chalk.red(error.message));
          }
        } else {
          console.error(chalk.red(`No image URL found for icon (${iconCounter}/${totalIcons}): ${component.name}`));
        }
      }
    }

    // Process images (components with names starting with "img/")
    const imageComponents = components.filter(component => component.name.startsWith('img/'));
    if (imageComponents.length > 0) {
      console.log(chalk.yellow(`\nProcessing ${imageComponents.length} images...`));

      // Get PNG URLs for images (we'll convert to webp if needed)
      const imageUrls = await getImageUrls(config.fileId, imageComponents, 'png');

      // Process each image
      let imageCounter = 0;
      const totalImages = imageComponents.length;
      for (const component of imageComponents) {
        imageCounter++;
        const imageUrl = imageUrls[component.id];
        if (imageUrl) {
          // Update the spinner message to include progress
          const spinner = ora(`Processing image (${imageCounter}/${totalImages}): ${component.name}`).start();

          try {
            // Extract the image name from the component name (remove 'img/' prefix)
            const imageName = component.name.replace('img/', '');
            const sanitizedName = imageName.replace(/\s+/g, '_').toLowerCase();
            const fileNameBase = `${config.images.prefix}${sanitizedName}`;

            // Download the image
            const imageBuffer = await downloadImage(imageUrl);

            // Get the list of DPIs to process (exclude any in skipDpi)
            const dpisToProcess = Object.keys(DPI_SCALES).filter(dpi => 
              !config.images.skipDpi || !config.images.skipDpi.includes(dpi)
            );

            // Process for each DPI
            for (const dpi of dpisToProcess) {
              const scale = DPI_SCALES[dpi];
              const drawablePath = path.join(config.images.path, `drawable-${dpi}`);
              await fs.ensureDir(drawablePath);

              const fileName = `${fileNameBase}.${config.images.format}`;
              const filePath = path.join(drawablePath, fileName);

              // Process the image for this DPI
              const processedImage = await processImageForDpi(
                imageBuffer, 
                dpi, 
                config.images.format, 
                config.images.quality, 
                scale
              );

              // Save the processed image
              await fs.writeFile(filePath, processedImage);
            }

            spinner.succeed(`Image saved (${imageCounter}/${totalImages}): ${fileNameBase} (${dpisToProcess.length} DPI variants)`);
          } catch (error) {
            spinner.fail(`Failed to process image (${imageCounter}/${totalImages}): ${component.name}`);
            console.error(chalk.red(error.message));
          }
        } else {
          console.error(chalk.red(`No image URL found for image (${imageCounter}/${totalImages}): ${component.name}`));
        }
      }
    }

    console.log(chalk.green('\nAsset download and processing complete!'));
  } catch (error) {
    console.error(chalk.red('An error occurred:'), error.message);
    process.exit(1);
  }
}

// Start the application
main();