from PIL import Image, ImageDraw

def add_corners(im, rad):
    circle = Image.new('L', (rad * 2, rad * 2), 0)
    draw = ImageDraw.Draw(circle)
    draw.ellipse((0, 0, rad * 2 - 1, rad * 2 - 1), fill=255)
    alpha = Image.new('L', im.size, 255)
    w, h = im.size
    alpha.paste(circle.crop((0, 0, rad, rad)), (0, 0))
    alpha.paste(circle.crop((0, rad, rad, rad * 2)), (0, h - rad))
    alpha.paste(circle.crop((rad, 0, rad * 2, rad)), (w - rad, 0))
    alpha.paste(circle.crop((rad, rad, rad * 2, rad * 2)), (w - rad, h - rad))
    im.putalpha(alpha)
    return im

# 1. 加载并转换
img = Image.open('/Users/zeelin/WorkCode/cli-switch/docs/ZeeLinCode-logo/cli-switch.png').convert("RGBA")

# 2. 设置标准尺寸和内容尺寸 (macOS 规范：1024 里的内容约为 824)
canvas_size = 1024
content_size = 824 
img_resized = img.resize((content_size, content_size), Image.Resampling.LANCZOS)

# 3. 添加圆角 (比例适配缩小后的尺寸)
# 824 的 17.5% 约为 144
img_rounded = add_corners(img_resized, 144)

# 4. 创建透明画布并将图标居中
final_img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
offset = (canvas_size - content_size) // 2
final_img.paste(img_rounded, (offset, offset))

# 5. 保存
final_img.save('build/rounded-fixed.png')
print("Padded rounded icon created for macOS Dock consistency.")
