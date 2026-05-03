#!/usr/bin/env python3
"""
NEXIA OS — DataBook Generator
Lê /docs e gera PDF automaticamente.
Usado pelo GitHub Actions em todo push na main.
"""
import os
import sys
from datetime import datetime

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
except ImportError:
    print("Installing reportlab...")
    os.system("pip install reportlab --quiet")
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.enums import TA_CENTER, TA_LEFT

DOCS_DIR = os.path.join(os.path.dirname(__file__), '..', 'docs')
OUTPUT   = os.path.join(os.path.dirname(__file__), '..', 'NEXIA_DataBook.pdf')

def read_doc(filename):
    path = os.path.join(DOCS_DIR, filename)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    return ""

def md_to_para(text, style):
    """Convert basic markdown to ReportLab paragraphs."""
    items = []
    for line in text.split('\n'):
        line = line.rstrip()
        if line.startswith('# '):
            items.append(Paragraph(line[2:], style['h1']))
        elif line.startswith('## '):
            items.append(Paragraph(line[3:], style['h2']))
        elif line.startswith('### '):
            items.append(Paragraph(line[4:], style['h3']))
        elif line.startswith('- ') or line.startswith('* '):
            items.append(Paragraph('• ' + line[2:], style['bullet']))
        elif line.startswith('|'):
            pass  # skip tables in text mode
        elif line.strip() == '' or line.strip() == '---':
            items.append(Spacer(1, 0.2*cm))
        else:
            if line.strip():
                safe = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                items.append(Paragraph(safe, style['body']))
    return items

def build():
    doc = SimpleDocTemplate(
        OUTPUT, pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm
    )

    base = getSampleStyleSheet()
    style = {
        'h1':     ParagraphStyle('h1',   parent=base['Heading1'], fontSize=18, textColor=colors.HexColor('#1a1a2e'), spaceAfter=12),
        'h2':     ParagraphStyle('h2',   parent=base['Heading2'], fontSize=14, textColor=colors.HexColor('#16213e'), spaceAfter=8),
        'h3':     ParagraphStyle('h3',   parent=base['Heading3'], fontSize=11, textColor=colors.HexColor('#0f3460'), spaceAfter=6),
        'body':   ParagraphStyle('body', parent=base['Normal'],   fontSize=9,  leading=14, spaceAfter=4),
        'bullet': ParagraphStyle('blt',  parent=base['Normal'],   fontSize=9,  leftIndent=15, spaceAfter=3),
        'center': ParagraphStyle('ctr',  parent=base['Normal'],   fontSize=9,  alignment=TA_CENTER),
        'title':  ParagraphStyle('ttl',  parent=base['Title'],    fontSize=28, textColor=colors.HexColor('#1a1a2e'), alignment=TA_CENTER),
        'sub':    ParagraphStyle('sub',  parent=base['Normal'],   fontSize=12, textColor=colors.HexColor('#16213e'), alignment=TA_CENTER),
    }

    story = []

    # Cover
    story.append(Spacer(1, 3*cm))
    story.append(Paragraph("NEXIA OS", style['title']))
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("Enterprise Data Book", style['sub']))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(f"Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M')}", style['center']))
    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#1a1a2e')))
    story.append(Spacer(1, 2*cm))

    # System info table
    data = [
        ['Stack', 'Node.js 20+ | Firebase Admin | 43 backend handlers'],
        ['Deploy', 'Render (render.yaml configurado)'],
        ['Frontend', '34 HTMLs estáticos servidos por Express'],
        ['Auth', 'Firebase Auth (verifyIdToken)'],
        ['Database', 'Firestore (multi-tenant)'],
        ['AI Providers', '47 providers com fallback automático'],
        ['Monitoramento', 'Sentinel — scan diário 05:00 BRT + auto-heal'],
    ]
    t = Table(data, colWidths=[4*cm, 13*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f0f0f0')),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 1*cm))

    # Read and include docs
    for fname, title in [
        ('architecture.md', 'Arquitetura'),
        ('handoff.md', 'Handoff & Estado Atual'),
    ]:
        content = read_doc(fname)
        if content:
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cccccc')))
            story.append(Spacer(1, 0.3*cm))
            story.extend(md_to_para(content, style))
            story.append(Spacer(1, 0.5*cm))

    doc.build(story)
    print(f"✅ DataBook gerado: {OUTPUT}")

if __name__ == '__main__':
    build()
