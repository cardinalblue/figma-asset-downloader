# Figma Asset Downloader

A Node.js tool for downloading and converting Figma assets for Android projects. This tool allows you to download icons as SVG and convert them to Android vector XML format, as well as download images in different DPI resolutions.

## Features

- Download icons from Figma and convert to Android vector XML format
- Download images in multiple DPI resolutions (ldpi, mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi)
- Support for WebP and PNG image formats
- Configurable quality settings for image compression
- Ability to skip specific DPI options
- Customizable export paths for both icons and images
- Configurable file prefixes for icons and images
- Command-line interface to specify component names for selective downloads
- Find and report duplicate components in your Figma file

## Installation

### Global Installation

```bash
npm install -g @piccollage/figma-asset-downloader
```

### Local Installation

```bash
npm install @piccollage/figma-asset-downloader
```

## Configuration

Create a configuration file at `.figma/asset_download.yaml` in your project directory. An example configuration file is provided in the repository root as `figma-asset-downloader.config.yaml`.

### Configuration Options

```yaml
# Figma file ID (required)
# You can find this in the URL of your Figma file: https://www.figma.com/file/XXXXXXXXXXXXXXXX/
fileId: "YOUR_FIGMA_FILE_ID"

# Optional: Figma page ID to restrict component search to a specific page
# You can find this in the URL when you have a page selected:
# https://www.figma.com/file/XXXX/FileName?node-id=YYYY%3AZZZZ
# where YYYY is the page ID
pageId: "YOUR_PAGE_ID"  # Optional - remove or leave empty to search all pages

# Icon configuration
icons:
  # Export path for icons (path to the res folder, doesn't need to be named "res")
  # The tool will create a 'drawable' subdirectory in this path
  path: "app/src/main/res"
  
  # Prefix for icon filenames (default: 'ic_')
  prefix: "ic_"

# Image configuration
images:
  # Export path for images (can be different from icons path)
  # The tool will create 'drawable-mdpi', 'drawable-hdpi', etc. subdirectories
  path: "app/src/main/res"
  
  # Image format (webp or png)
  format: "webp"  # or "png"
  
  # Quality setting for compression (1-100)
  quality: 90
  
  # Prefix for image filenames (default: 'img_')
  prefix: "img_"
  
  # Optional: Array of DPI options to skip during export
  # Available DPIs: ldpi, mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi
  skipDpi:
    - "ldpi"  # Skip ldpi resolution
    # - "mdpi"  # Uncomment to skip mdpi
    # - "xxxhdpi"  # Uncomment to skip xxxhdpi
```

### Default Values

If certain configuration options are not provided, the tool will use these defaults:

- `icons.path`: "res"
- `icons.prefix`: "ic_"
- `images.path`: "res"
- `images.format`: "webp"
- `images.quality`: 90
- `images.prefix`: "img_"

## Component Naming Convention

For the tool to correctly identify and process assets, your Figma components must follow these naming conventions:

- **Icons**: Component names must start with "icon/" (e.g., icon/home, icon/settings, icon/arrow_back)
- **Images**: Component names must start with "img/" (e.g., img/banner, img/profile, img/background)

The tool uses these prefixes to determine whether to process the component as an icon (SVG to XML conversion) or as an image (multiple DPI exports).

## Usage

### Setting Up Your Figma API Token

Before using the tool, you need to set your Figma API token. You can obtain a personal access token from your Figma account settings.

#### Method 1: Terminal Environment Variable

```bash
export FIGMA_TOKEN=your_figma_api_token
```

#### Method 2: Using a .env File

Create a `.env` file in the directory from which you run the command:

```
FIGMA_TOKEN=your_figma_api_token
```

Important notes about the `.env` file:

- The tool looks for the `.env` file in the current working directory (the directory from which you run the command), not necessarily the project root
- This works with `npx` too - if you run `npx figma-asset-downloader` from a directory containing a `.env` file, it will use the token from that file
- If both a system-wide environment variable (e.g., from `.zprofile` or `.bashrc`) and a `.env` file exist, the `.env` file takes precedence

### Running the Tool

If installed globally:

```bash
figma-asset-downloader [options] [componentNames...]
```

If installed locally:

```bash
npx figma-asset-downloader [options] [componentNames...]
```

Or using the script directly:

```bash
node src/index.js [options] [componentNames...]
```

### Command Line Options

- `[componentNames...]`: Names of components to download (e.g., icon/home, img/banner)
- `-a, --all`: Download all components from the Figma file
- `-f, --find-duplicate`: Find and list all duplicate components in the Figma file
- `-V, --version`: Output the version number
- `-h, --help`: Display help for command

### Examples

Download a single icon:

```bash
figma-asset-downloader icon/home
```

Download multiple assets:

```bash
figma-asset-downloader icon/home icon/settings img/banner img/profile
```

Download all components from the Figma file:

```bash
figma-asset-downloader --all
```

Find duplicate components in your Figma file:

```bash
figma-asset-downloader --find-duplicate
```

## How It Works

1. The tool reads the configuration from `.figma/asset_download.yaml`
2. It connects to the Figma API using your FIGMA_TOKEN
3. It fetches components from the specified Figma file (and optionally from a specific page)
4. For each specified component:
   - If it's an icon (name starts with "icon/"):
     - Downloads as SVG
     - Optimizes the SVG using SVGO
     - Converts to Android vector XML format
     - Saves to the configured path with the configured prefix
   - If it's an image (name starts with "img/"):
     - Downloads as PNG at high resolution
     - Processes for each DPI resolution (scaling appropriately)
     - Converts to the configured format (WebP or PNG)
     - Applies the configured quality settings
     - Saves to the configured paths with appropriate naming conventions
5. Reports success or any errors encountered during the process

## Directory Structure

After running the tool, your assets will be organized as follows:

### Icons
```
[icons.path]/
├── drawable/
│   ├── [prefix]component_name1.xml  # prefix is configurable, default is "ic_"
│   ├── [prefix]component_name2.xml
│   └── ...
```

### Images
```
[images.path]/
├── drawable-ldpi/
│   ├── [prefix]component_name1.[format]  # prefix and format are configurable
│   ├── [prefix]component_name2.[format]
│   └── ...
├── drawable-mdpi/
│   ├── [prefix]component_name1.[format]
│   └── ...
├── drawable-hdpi/
│   └── ...
├── drawable-xhdpi/
│   └── ...
├── drawable-xxhdpi/
│   └── ...
└── drawable-xxxhdpi/
    └── ...
```

Note: DPI folders specified in the `skipDpi` configuration will not be created.

## Requirements

- Node.js 14 or higher
- Figma API token with read access to your files
- A Figma file with components following the naming convention (icon/*, img/*)

## Troubleshooting

### Common Issues

1. **Error: Figma token is required**
   - Make sure you've set the FIGMA_TOKEN environment variable or included it in a .env file

2. **Error: Configuration file not found**
   - Ensure you have a configuration file at `.figma/asset_download.yaml`
   - You can copy the example from `figma-asset-downloader.config.yaml` as a starting point

3. **No components found matching the provided names**
   - Check that your component names in Figma exactly match what you're providing in the command
   - Component names are case-sensitive
   - Make sure the components exist in the specified page (if pageId is configured)

4. **Found duplicate components with the same name**
   - The tool requires unique component names to avoid ambiguity
   - Use the `--find-duplicate` flag to identify and fix duplicate component names in your Figma file

## License

MIT
