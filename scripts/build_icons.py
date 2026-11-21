"""Export the supplied transparent emblem without its empty outer margins."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
image=Image.open(root/'师大标识.png').convert('RGBA')
bounds=image.getchannel('A').getbbox()
if bounds is None:
    raise ValueError('The source icon is fully transparent')
image=image.crop(bounds)
side=max(image.size)
square=Image.new('RGBA',(side,side),(0,0,0,0))
square.alpha_composite(image,((side-image.width)//2,(side-image.height)//2))
out=root/'extension/icons'
out.mkdir(exist_ok=True)
for size in [16,32,48,128]:
    square.resize((size,size),Image.Resampling.LANCZOS).save(out/f'emblem-{size}.png',optimize=True)
