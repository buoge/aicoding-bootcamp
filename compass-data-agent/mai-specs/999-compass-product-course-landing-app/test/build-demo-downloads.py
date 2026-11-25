"""Build the prototype's offline download fixtures from demo-content.js.

uv run --no-project --with python-docx==1.2.0 --with python-pptx==1.0.2 \
  --with reportlab==4.4.9 python build-demo-downloads.py

Generated files are embedded as base64 so file:// and the home distribution
work identically without a backend, CDN, fonts or runtime dependencies.
"""
import base64
import io
import json
from pathlib import Path

from docx import Document
from docx.shared import Inches as DocInches
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_LEGEND_POSITION
from pptx.util import Inches, Pt
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.graphics.shapes import Drawing, Rect, String, Line

prototype = Path(__file__).resolve().parent.parent / 'design/prototype'
raw = (prototype / 'demo-content.js').read_text()
data = json.loads(raw.split('window.COMPASS_DEMO_REPORT = ', 1)[1].strip().removesuffix(';'))
files = {}

# PDF uses a vector chart and an embedded Chinese font; Word uses the same series.
font_path = next(p for p in [Path('/System/Library/Fonts/PingFang.ttc'), Path('/System/Library/Fonts/STHeiti Medium.ttc'), Path('/System/Library/Fonts/Supplemental/Songti.ttc'), Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')] if p.exists())
pdfmetrics.registerFont(TTFont('CompassCJK', str(font_path)))
style = ParagraphStyle('body', fontName='CompassCJK', fontSize=11, leading=19, textColor=colors.HexColor('#273c31'), wordWrap='CJK', spaceAfter=12)
heading = ParagraphStyle('title', parent=style, fontSize=22, leading=30, spaceAfter=18)
subheading = ParagraphStyle('subheading', parent=style, fontSize=14, leading=22)
chart = Drawing(450, 180)
for v in [0, 10, 20, 30]:
    chart.add(Line(28, 28 + v * 4.2, 440, 28 + v * 4.2, strokeColor=colors.HexColor('#e4e9e2')))
    chart.add(String(12, 24 + v * 4.2, str(v), fontName='CompassCJK', fontSize=9))
for n, (day, value) in enumerate(zip(data['days'], data['values'])):
    x = 43 + n * 56
    chart.add(Rect(x, 28, 31, value * 4.2, fillColor=colors.HexColor('#1c5145'), strokeColor=None))
    chart.add(String(x + 15, 35 + value * 4.2, str(value), textAnchor='middle', fontName='CompassCJK', fontSize=9))
    chart.add(String(x + 15, 12, day, textAnchor='middle', fontName='CompassCJK', fontSize=9))
channel_rows = [['渠道', '净销售额（万元）', '占比']] + [[c['name'], f"{c['value']:.2f}", c['share']] for c in data['channels']]
pdf_buffer = io.BytesIO()
pdf = SimpleDocTemplate(pdf_buffer, title=data['title'], author='Compass', leftMargin=55, rightMargin=55, topMargin=44, bottomMargin=44)
table = Table(channel_rows, colWidths=[130, 180, 130])
table.setStyle(TableStyle([('FONTNAME', (0, 0), (-1, -1), 'CompassCJK'), ('FONTSIZE', (0, 0), (-1, -1), 10), ('BOTTOMPADDING', (0, 0), (-1, -1), 9), ('TOPPADDING', (0, 0), (-1, -1), 9), ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#edf2e8')), ('LINEBELOW', (0, 0), (-1, -1), .4, colors.HexColor('#d8e1d5'))]))
pdf.build([Paragraph(data['title'], heading), Paragraph(data['period'] + ' · 合成示例', style), Paragraph(data['conclusion'], style), Paragraph('每日净销售额 / 万元', subheading), chart, Spacer(1, 12), Paragraph('渠道拆解', subheading), table, Spacer(1, 20), Paragraph('建议关注', subheading), Paragraph(data['recommendation'], style), Paragraph(data['source'], style), Paragraph(data['metric'], style)])
files['pdf'] = ('application/pdf', pdf_buffer.getvalue())

# PNG chart for Word, generated from the same series with system CJK fonts.
from PIL import Image, ImageDraw, ImageFont
font = ImageFont.truetype(str(font_path), 24)
image = Image.new('RGB', (1200, 430), '#f8faf6')
draw = ImageDraw.Draw(image)
for v in [0, 10, 20, 30]:
    y = 350 - v * 9
    draw.line((65, y, 1180, y), fill='#dce4d9', width=2)
    draw.text((15, y - 15), str(v), font=font, fill='#60715f')
for n, (day, value) in enumerate(zip(data['days'], data['values'])):
    x = 100 + n * 155
    draw.rounded_rectangle((x, 350 - value * 9, x + 75, 350), radius=8, fill='#1c5145')
    draw.text((x + 38, 315 - value * 9), str(value), font=font, fill='#273c31', anchor='mt')
    draw.text((x + 38, 374), day, font=font, fill='#60715f', anchor='mt')
image_buffer = io.BytesIO()
image.save(image_buffer, format='PNG')
image_buffer.seek(0)
doc = Document()
doc.core_properties.title = data['title']
doc.core_properties.author = 'Compass'
doc.add_heading(data['title'], 0)
doc.add_paragraph(data['period'] + ' · 合成示例')
doc.add_paragraph(data['conclusion'])
doc.add_heading('每日净销售额 / 万元', level=1)
doc.add_picture(image_buffer, width=DocInches(6))
doc.add_heading('渠道拆解', level=1)
word_table = doc.add_table(rows=0, cols=3)
word_table.style = 'Light Shading Accent 1'
for row in channel_rows:
    for cell, text in zip(word_table.add_row().cells, row):
        cell.text = text
for title, body in [('建议关注', data['recommendation']), ('数据来源与口径', data['source'] + '\n' + data['metric'])]:
    doc.add_heading(title, level=1)
    doc.add_paragraph(body)
word_buffer = io.BytesIO()
doc.save(word_buffer)
files['docx'] = ('application/vnd.openxmlformats-officedocument.wordprocessingml.document', word_buffer.getvalue())

# Editable PowerPoint with native chart and text objects.
pres = Presentation()
pres.slide_width = Inches(13.333)
pres.slide_height = Inches(7.5)
pres.core_properties.title = data['title']
pres.core_properties.author = 'Compass'
def text(slide, value, x, y, w, h, size=24, color='273C31'):
    frame = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)).text_frame
    frame.word_wrap = True
    for n, line in enumerate(value.split('\n')):
        paragraph = frame.paragraphs[0] if n == 0 else frame.add_paragraph()
        paragraph.text = line
        paragraph.font.name = 'PingFang SC'
        paragraph.font.size = Pt(size)
        paragraph.font.color.rgb = RGBColor.from_string(color)
        paragraph.space_after = Pt(16)
for n, item in enumerate(data['slides']):
    slide = pres.slides.add_slide(pres.slide_layouts[6])
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = RGBColor.from_string('1C5145' if n == 0 else 'F8FAF6')
    color = 'F5F8EE' if n == 0 else '273C31'
    text(slide, 'COMPASS / WEEKLY REVIEW', .7, .35, 11, .5, 11, color)
    text(slide, item['title'], .7, 1, 12, .9, 34, color)
    text(slide, item['body'], .7, 2.1, 4.6 if n == 2 else 11.5, 4.5, 20 if n == 2 else 25, color)
    if n == 2:
        series = CategoryChartData()
        series.categories = data['days']
        series.add_series('净销售额（万元）', data['values'])
        native = slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(5.5), Inches(2.1), Inches(7.1), Inches(4.5), series).chart
        native.has_legend = True
        native.legend.position = XL_LEGEND_POSITION.BOTTOM
        native.legend.font.size = Pt(12)
        native.category_axis.tick_labels.font.size = Pt(12)
        native.value_axis.tick_labels.font.size = Pt(12)
        native.series[0].format.fill.solid()
        native.series[0].format.fill.fore_color.rgb = RGBColor.from_string('1C5145')
        native.plots[0].has_data_labels = True
        native.plots[0].data_labels.position = XL_LABEL_POSITION.OUTSIDE_END
        native.plots[0].data_labels.font.size = Pt(12)
    text(slide, f'行野运动集团 · 合成示例数据                         {n + 1} / 5', .7, 7, 12, .35, 10, color)
ppt_buffer = io.BytesIO()
pres.save(ppt_buffer)
files['pptx'] = ('application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt_buffer.getvalue())
payload = {extension: {'name': data['title'] + '.' + extension, 'type': mime, 'data': base64.b64encode(body).decode()} for extension, (mime, body) in files.items()}
(prototype / 'demo-downloads.js').write_text('// Generated by test/build-demo-downloads.py; edit demo-content.js to change content.\nwindow.COMPASS_DEMO_DOWNLOADS = ' + json.dumps(payload, ensure_ascii=False) + ';\n')
for extension, (_, body) in files.items():
    print(f'{extension}: {len(body):,} bytes')
