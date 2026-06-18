const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputSvg = path.join(__dirname, '../public/icon.svg');
const publicDir = path.join(__dirname, '../public');

const sizes = [192, 512];

async function generate() {
  console.log('Generating PNG icons from SVG...');
  for (const size of sizes) {
    // Standard icon
    const standardPath = path.join(publicDir, `icon-${size}x${size}.png`);
    await sharp(inputSvg)
      .resize(size, size)
      .png()
      .toFile(standardPath);
    console.log(`Generated standard icon: ${standardPath}`);

    // Maskable icon
    const maskablePath = path.join(publicDir, `icon-${size}x${size}-maskable.png`);
    await sharp(inputSvg)
      .resize(size, size)
      .png()
      .toFile(maskablePath);
    console.log(`Generated maskable icon: ${maskablePath}`);
  }
  console.log('Icon generation complete!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
