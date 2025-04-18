#!/bin/bash

# Figma Component Search and Download Runner
# This script makes it easier to run the tool with your Figma token

# Check if FIGMA_TOKEN is provided
if [ -z "$1" ]; then
  echo "Error: Figma token is required"
  echo "Usage: ./run.sh YOUR_FIGMA_TOKEN [command arguments]"
  echo "Example: ./run.sh abcd1234 --download \"button\""
  exit 1
fi

# Set the token and remove it from the arguments
FIGMA_TOKEN="$1"
shift

# Run the script with the provided arguments
FIGMA_TOKEN="$FIGMA_TOKEN" node figma-component-search.js "$@"