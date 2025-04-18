#!/usr/bin/env node

/**
 * Figma Component Search
 * 
 * A tool to search for design components from a specific Figma file
 * and output their JSON structure.
 */

// Import required dependencies
const axios = require('axios');
const chalk = require('chalk');
const { program } = require('commander');
require('dotenv').config();

// Constants
const FILE_ID = 'EN37wd3Y7cGMMX1zZMj094'; // The Figma file ID to search in
const API_BASE_URL = 'https://api.figma.com/v1';

// Get Figma token from environment variable
const FIGMA_TOKEN = process.env.FIGMA_TOKEN;

if (!FIGMA_TOKEN) {
  console.error(chalk.red('Error: Figma token is required'));
  console.log('Please set the FIGMA_TOKEN environment variable or use the run.sh script');
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
  .version('1.0.0')
  .description('Search for components in a Figma file and output their JSON structure')
  .option('-d, --download', 'Download components as PNG images (not implemented in this version)')
  .option('-i, --id <id>', 'Search for a specific component by ID')
  .option('-v, --verbose', 'Show detailed component information')
  .option('-o, --output <format>', 'Output format (json or table)', 'json')
  .argument('[searchTerm]', 'Term to search for in component names, paths, or descriptions')
  .parse(process.argv);

const options = program.opts();
const searchTerm = program.args[0] || '';

/**
 * Fetch the Figma file and extract components
 */
async function fetchComponents() {
  try {
    console.log(chalk.blue(`Fetching components from Figma file: ${FILE_ID}...`));
    
    // Get the file data from Figma API
    const response = await figmaApi.get(`/files/${FILE_ID}`);
    const fileData = response.data;
    
    // Extract components from the file
    const components = extractComponents(fileData);
    
    // Filter components if a search term is provided
    const filteredComponents = searchTerm 
      ? filterComponents(components, searchTerm)
      : components;
    
    // If a specific component ID is requested
    if (options.id) {
      const component = filteredComponents.find(c => c.id === options.id);
      if (component) {
        outputComponent(component);
      } else {
        console.error(chalk.red(`Component with ID "${options.id}" not found`));
        process.exit(1);
      }
    } else {
      // Output all filtered components
      outputComponents(filteredComponents);
    }
  } catch (error) {
    handleApiError(error);
  }
}

/**
 * Extract components from the Figma file data
 */
function extractComponents(fileData) {
  const components = [];
  const componentSets = new Map();
  
  // First pass: collect component sets
  traverseNode(fileData.document, (node, path) => {
    if (node.type === 'COMPONENT_SET') {
      componentSets.set(node.id, {
        node,
        path
      });
    }
  });
  
  // Second pass: collect components
  traverseNode(fileData.document, (node, path) => {
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
        componentSet: parentComponentSet,
        node: node // Include the full node data
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
 * Filter components based on a search term
 */
function filterComponents(components, term) {
  const searchTermLower = term.toLowerCase();
  
  return components.filter(component => {
    return (
      component.name.toLowerCase().includes(searchTermLower) ||
      component.path.toLowerCase().includes(searchTermLower) ||
      component.description.toLowerCase().includes(searchTermLower)
    );
  });
}

/**
 * Output a single component
 */
function outputComponent(component) {
  if (options.output === 'json') {
    // For JSON output, we can include the full node data
    const output = options.verbose 
      ? component 
      : {
          id: component.id,
          name: component.name,
          path: component.path,
          type: component.type,
          description: component.description,
          width: component.width,
          height: component.height,
          componentSetId: component.componentSetId,
          componentSet: component.componentSet
        };
    
    console.log(JSON.stringify(output, null, 2));
  } else {
    // For table output, we'll just show basic info
    console.log(chalk.green(`\nComponent: ${component.name}`));
    console.log(chalk.yellow(`ID: ${component.id}`));
    console.log(chalk.yellow(`Path: ${component.path}`));
    console.log(chalk.yellow(`Size: ${component.width}x${component.height}px`));
    
    if (component.description) {
      console.log(chalk.yellow(`Description: ${component.description}`));
    }
    
    if (component.componentSet) {
      console.log(chalk.yellow(`Component Set: ${component.componentSet.name} (${component.componentSetId})`));
    }
  }
}

/**
 * Output multiple components
 */
function outputComponents(components) {
  if (components.length === 0) {
    console.log(chalk.yellow('No components found matching your criteria.'));
    return;
  }
  
  console.log(chalk.green(`Found ${components.length} components:`));
  
  if (options.output === 'json') {
    // For JSON output
    const output = components.map(component => {
      if (options.verbose) {
        return component;
      } else {
        return {
          id: component.id,
          name: component.name,
          path: component.path,
          type: component.type,
          description: component.description,
          width: component.width,
          height: component.height,
          componentSetId: component.componentSetId,
          componentSet: component.componentSet
        };
      }
    });
    
    console.log(JSON.stringify(output, null, 2));
  } else {
    // For table output
    components.forEach((component, index) => {
      console.log(chalk.yellow(`\n${index + 1}. ${component.name} (${component.id})`));
      console.log(chalk.blue(`   Path: ${component.path}`));
      console.log(chalk.blue(`   Size: ${component.width}x${component.height}px`));
      
      if (component.description) {
        console.log(chalk.blue(`   Description: ${component.description}`));
      }
    });
  }
}

/**
 * Handle API errors
 */
function handleApiError(error) {
  console.error(chalk.red('Error fetching data from Figma API:'));
  
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.error(chalk.red(`Status: ${error.response.status}`));
    console.error(chalk.red(`Message: ${JSON.stringify(error.response.data)}`));
    
    if (error.response.status === 403) {
      console.error(chalk.yellow('This might be due to an invalid Figma token or insufficient permissions.'));
    } else if (error.response.status === 404) {
      console.error(chalk.yellow(`The Figma file with ID "${FILE_ID}" could not be found.`));
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
  
  process.exit(1);
}

// Start the application
fetchComponents();