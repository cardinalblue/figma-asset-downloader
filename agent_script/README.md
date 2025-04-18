# Figma Component Search and Download

A Node.js tool to search for design components from a specific Figma file and download them as PNG images.

## Overview

This tool connects to the Figma API to fetch components from a specified Figma file and allows you to:
- Search through components by name, path, or description
- View component details including size and location in the file
- Download components as high-quality PNG images

It's useful for designers and developers who need to quickly find and extract specific components from large Figma files.

## Prerequisites

- Node.js 18 or higher
- A Figma personal access token

## Installation

1. Clone this repository or download the files
2. Navigate to the project directory

## Usage

### Setting Up Your Figma Token

You have two options for providing your Figma token:

#### Option 1: Environment Variable

Set up your Figma token as an environment variable:

```bash
# On macOS/Linux
export FIGMA_TOKEN=your_figma_token

# On Windows (Command Prompt)
set FIGMA_TOKEN=your_figma_token

# On Windows (PowerShell)
$env:FIGMA_TOKEN="your_figma_token"
```

#### Option 2: Using the run.sh Script

For convenience, you can use the included run.sh script which accepts your token as the first argument:

```bash
# Make the script executable (if not already)
chmod +x run.sh

# Run with your token
./run.sh your_figma_token [other arguments]
```

Examples:
```bash
# Search for components
./run.sh your_figma_token "button"

# Download components
./run.sh your_figma_token --download "icon"
```

### Search for Components

To list all components in the Figma file:

```bash
node figma-component-search.js
```

To search for components containing a specific term:

```bash
node figma-component-search.js "button"
```

This will find all components with "button" in their name, path, or description.

### Download Components

To download all components in the file as PNG images:

```bash
node figma-component-search.js --download
```

To download components matching a search term:

```bash
node figma-component-search.js --download "button"
```

To download a specific component by its ID:

```bash
node figma-component-search.js --download --id "123:456"
```

Downloaded images are saved to the `downloads` directory within the script folder.

### Using npm Scripts

You can also use the npm scripts defined in package.json:

```bash
# List all components
npm run search

# Search for specific components
npm run search -- "icon"

# Download all components
npm run download

# Download specific components
npm run download -- "icon"
```

## Getting a Figma Personal Access Token

1. Log in to your Figma account
2. Go to Settings > Account > Personal Access Tokens
3. Click "Create a new personal access token"
4. Give your token a name and click "Create token"
5. Copy the token (you won't be able to see it again)

## Figma File ID

The tool is currently configured to use the Figma file with ID: `EN37wd3Y7cGMMX1zZMj094`

If you need to change the file ID, edit the `FILE_ID` constant in the `figma-component-search.js` file.

## Output Format

The tool displays components in a table format with the following columns:

- ID: The unique identifier of the component
- Name: The component name
- Path: The path to the component in the Figma file structure
- Size: The width and height of the component in pixels

## Examples

### Find all button components

```bash
node figma-component-search.js "button"
```

### Find and download all icon components

```bash
node figma-component-search.js --download "icon"
```

### Download a specific component by ID

```bash
node figma-component-search.js --download --id "123:456"
```

### Find components in a specific section

```bash
node figma-component-search.js "navigation"
```

## Downloaded Files

Downloaded PNG files are saved with the following naming convention:

```
component_name-component_id.png
```

Where:
- `component_name` is a sanitized version of the component name (spaces and special characters replaced with underscores)
- `component_id` is the unique identifier of the component in Figma

All files are saved to the `downloads` directory within the script folder.

## Future Enhancements

Potential future enhancements for this tool:

- Export component styles and properties as CSS or JSON
- Interactive mode with more filtering options
- Support for multiple Figma files
- Batch download with custom naming templates

**Note:** SVG export and Android vector drawable conversion have been implemented in the main project. See the root README.md for more information.