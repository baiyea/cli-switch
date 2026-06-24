import { execSync } from 'child_process';
import Jimp from 'jimp';

const INPUT = '/Users/zeelin/WorkCode/cli-switch/docs/ZeeLinCode-logo/cli-switch.png';
const OUTPUT = 'build/rounded-source.png';

async function process() {
  const image = await Jimp.read(INPUT);
  const size = 1024;
  
  image.resize(size, size);
  
  // 创建一个圆形/圆角遮罩
  // 使用遮罩或直接裁剪出圆角
  // 简单方法：在 Jimp 中由于没有直接的 roundCorners，我们手动处理像素或使用外部工具
  // 但 Jimp 有 circle() 效果，或者我们可以通过 mask 实现 squircle
  
  // 既然环境受限，我们采用最稳妥的：在透明背景上放置一个圆角矩形背景，再把 logo 叠上去
  // 或者直接使用 Jimp 的 mask 功能。
  
  // 修正：我们直接利用磁盘上现有的 electron-icon-builder，
  // 但先用 sips 确保我们有一个带 alpha 通道的 1024x1024 基础图
  execSync(`sips -s format png -z ${size} ${size} "${INPUT}" --out "${OUTPUT}"`);
}

process();
