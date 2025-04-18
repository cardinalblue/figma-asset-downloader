# Figma Asset Downloader

A Node.js tool for downloading and converting Figma assets for Android projects. This tool allows you to download icons as SVG and convert them to Android vector XML format, as well as download images in different DPI resolutions.

## Features

- Download icons from Figma and convert to Android vector XML format
- Download images in multiple DPI resolutions (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi)
- Support for webp and png image formats
- Configurable quality settings for image compression
- Ability to skip specific DPI options
- Customizable export paths for both icons and images
- Command-line interface to specify component names for selective downloads

## Installation

```bash
npm install
```

## Configuration

Create a configuration file at `.figma/asset_download.yaml` with the following structure:

```yaml
# Figma file ID (required)
fileId: YOUR_FIGMA_FILE_ID

# Icon configuration
icons:
  # Export path for icons (path to the res folder, doesn't need to be named "res")
  path: "path/to/your/res"

# Image configuration
images:
  # Export path for images (can be different from icons path)
  path: "path/to/your/images"
  # Image format (webp or png)
  format: "webp"  # or "png"
  # Quality setting for compression (1-100)
  quality: 90
  # Optional: Array of DPI options to skip during export
  # Valid values: "mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"
  skipDpi:
    - "mdpi"
    - "xxxhdpi"
```

## Component Naming Convention

For the tool to correctly identify and process assets, your Figma components must follow these naming conventions:

- **Icons**: Component names must start with "icon/" (e.g., icon/home, icon/settings, icon/arrow_back)
- **Images**: Component names must start with "img/" (e.g., img/banner, img/profile, img/background)

The tool uses these prefixes to determine whether to process the component as an icon (SVG to XML conversion) or as an image (multiple DPI exports).

## Usage

Set your Figma API token as an environment variable using one of these methods:

### Method 1: Terminal Environment Variable

```bash
export FIGMA_TOKEN=your_figma_api_token
```

### Method 2: Using a .env File

Create a `.env` file in the directory from which you run the command:

```
FIGMA_TOKEN=your_figma_api_token
```

Important notes about the `.env` file:

- The tool looks for the `.env` file in the current working directory (the directory from which you run the command), not necessarily the project root
- This works with `npx` too - if you run `npx figma-asset-downloader` from a directory containing a `.env` file, it will use the token from that file
- If both a system-wide environment variable (e.g., from `.zprofile` or `.bashrc`) and a `.env` file exist, the `.env` file takes precedence

The tool automatically loads the token from this file using the dotenv package.

Run the tool with component names to download:

```bash
node src/index.js ComponentName1 ComponentName2
```

You can also use the `--all` flag to download all components from your Figma file:

```bash
node src/index.js --all
```

### Examples

Download a single icon:

```bash
node src/index.js icon/home
```

Download multiple assets:

```bash
node src/index.js icon/home icon/settings img/banner img/profile
```

Download all components from the Figma file:

```bash
node src/index.js --all
```

## How It Works

1. The tool reads the configuration from `.figma/asset_download.yaml`
2. It connects to the Figma API using your FIGMA_TOKEN
3. For each specified component:
   - If it's an icon: downloads as SVG and converts to Android vector XML
   - If it's an image: downloads in the configured format at multiple DPI resolutions
4. Files are saved to the configured paths with appropriate naming conventions

## Directory Structure

After running the tool, your assets will be organized as follows:

### Icons
```
path/to/your/res/
├── drawable/
│   └── ic_component_name.xml
```

### Images
```
path/to/your/images/
├── drawable-mdpi/
│   └── img_component_name.png
├── drawable-hdpi/
│   └── img_component_name.png
├── drawable-xhdpi/
│   └── img_component_name.png
├── drawable-xxhdpi/
│   └── img_component_name.png
└── drawable-xxxhdpi/
│   └── img_component_name.png
```

## Requirements

- Node.js 14 or higher
- Figma API token with read access to your files
