#!/usr/bin/env node

const fs = require('fs-extra');
const { execSync } = require('child_process');
const path = require('path');
const chalk = require('chalk');

// Function to run a test and count files
function runTest(testName, args, expectedFileCount) {
  console.log(`\n=== Running Test: ${testName} ===`);
  
  // Remove test_output directory if it exists
  if (fs.existsSync('test_output')) {
    fs.removeSync('test_output');
  }
  
  // Run the command
  console.log(`> node src/index.js ${args}`);
  try {
    execSync(`node src/index.js ${args}`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error running test: ${error.message}`);
    process.exit(1);
  }
  
  // Count and list files
  console.log('> Files generated:');
  let fileCount = 0;
  
  function countFiles(directory) {
    const items = fs.readdirSync(directory);
    
    for (const item of items) {
      const itemPath = path.join(directory, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        countFiles(itemPath);
      } else if (stats.isFile()) {
        console.log(`  ${itemPath}`);
        fileCount++;
      }
    }
  }
  
  if (fs.existsSync('test_output')) {
    countFiles('test_output');
  }
  
  console.log(`\nTotal files exported: ${fileCount}`);
  
  // Validate file count
  if (expectedFileCount !== undefined && fileCount !== expectedFileCount) {
    console.error(chalk.red(`\n❌ TEST FAILED: ${testName}`));
    console.error(chalk.red(`Expected ${expectedFileCount} files but found ${fileCount} files`));
    process.exit(1);
  } else {
    console.log(chalk.green(`✅ File count matches expected count: ${fileCount}`));
  }
  
  return fileCount;
}

// Run the three tests
console.log('Starting tests...');

// Test 1: Single icon
const test1Count = runTest('Single Icon', 'icon/scissor', 1);

// Test 2: Single image
const test2Count = runTest('Single Image', 'img/grids', 5);

// Test 3: Multiple icons and images
const test3Count = runTest(
  'Multiple Icons and Images',
  'icon/scissor icon/scissor_cutout icon/cutout_scissor img/magic_portrait img/grids img/entries_magic_cam',
  18
);

// Summary
console.log('\n=== Test Summary ===');
console.log(`Test 1 (Single Icon): ${test1Count} files`);
console.log(`Test 2 (Single Image): ${test2Count} files`);
console.log(`Test 3 (Multiple Icons and Images): ${test3Count} files`);
console.log(chalk.green('\n✅ All tests completed successfully!'));