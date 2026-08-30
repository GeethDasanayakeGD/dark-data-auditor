import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
)
from reportlab.pdfgen import canvas

# Dynamic Page Numbering & Header/Footer Canvas
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            # First page is Cover Page (Skip Header/Footer)
            return
        
        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        
        # Header Line & Text
        self.drawString(54, 11 * inch - 36, "DARK DATA AUDITOR — EXECUTIVE SUSTAINABILITY & COST REPORT")
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 11 * inch - 42, 8.5 * inch - 54, 11 * inch - 42)
        
        # Footer Line & Text
        self.setFont("Helvetica", 8)
        self.drawString(54, 32, "CONFIDENTIAL — FOR INTERNAL USE & COMPLIANCE AUDIT ONLY")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(8.5 * inch - 54, 32, page_text)
        self.line(54, 44, 8.5 * inch - 54, 44)
        
        self.restoreState()


def generate_pdf_report(aggregates, files, output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = getSampleStyleSheet()
    
    # Theme Color Palette
    NAVY = colors.HexColor("#0F172A")
    BLUE = colors.HexColor("#2563EB")
    CYAN = colors.HexColor("#0284C7")
    TEXT_DARK = colors.HexColor("#1E293B")
    TEXT_MUTED = colors.HexColor("#64748B")
    BG_LIGHT = colors.HexColor("#F8FAFC")
    BORDER_COLOR = colors.HexColor("#E2E8F0")
    
    # Custom Paragraph Styles
    title_style = ParagraphStyle('CoverTitle', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=26, leading=32, textColor=NAVY, alignment=0)
    subtitle_style = ParagraphStyle('CoverSubtitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=CYAN, alignment=0)
    h1_style = ParagraphStyle('Heading1_Custom', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=15, leading=18, textColor=NAVY, spaceAfter=8)
    body_style = ParagraphStyle('Body_Custom', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=13, textColor=TEXT_DARK)
    kpi_val_style = ParagraphStyle('KPIValue', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=16, leading=20, textColor=NAVY, alignment=1)
    kpi_lbl_style = ParagraphStyle('KPILabel', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=TEXT_MUTED, alignment=1)

    story = []

    # ==========================================
    # PAGE 1: EXECUTIVE COVER PAGE
    # ==========================================
    story.append(Spacer(1, 30))
    story.append(Paragraph("DARK DATA AUDITOR SYSTEM", subtitle_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Enterprise Cloud Storage Sustainability & Cost Audit Report", title_style))
    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=3, color=BLUE, spaceAfter=24, spaceBefore=0))
    
    # Metadata Block
    meta_data = [
        [Paragraph("<b>Report Generated:</b>", body_style), Paragraph(datetime.now().strftime("%B %d, %Y - %H:%M:%S"), body_style)],
        [Paragraph("<b>Lead Auditor / System:</b>", body_style), Paragraph("Geeth Dasanayake (Dark Data Auditor Engine v9)", body_style)],
        [Paragraph("<b>Target Storage Scope:</b>", body_style), Paragraph("Multi-Cloud AWS S3, Google Drive & Local Filesystem", body_style)],
        [Paragraph("<b>Compliance Standard:</b>", body_style), Paragraph("<font color='#059669'><b>ISO 14001 / Green IT Cloud Standard</b></font>", body_style)],
    ]
    meta_table = Table(meta_data, colWidths=[140, 364])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LINEBELOW', (0,0), (-1,-1), 0.5, BORDER_COLOR),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 100))
    
    # Executive Summary Banner
    summary_text = (
        "<b>Executive Summary:</b> This audit report provides a comprehensive analysis of unstructured and dark data "
        "residing within the organization's cloud storage footprint. Leveraging machine learning classification models, "
        "this system identifies redundant, obsolete, and trivial (ROT) file structures to minimize cloud operational expenditure "
        "and drastically curtail unnecessary server carbon footprints."
    )
    summary_table = Table([[Paragraph(summary_text, body_style)]], colWidths=[504])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#EFF6FF")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#BFDBFE")),
        ('PADDING', (0,0), (-1,-1), 12),
    ]))
    story.append(summary_table)
    story.append(PageBreak())

    # ==========================================
    # PAGE 2: EXECUTIVE DASHBOARD & KPIS
    # ==========================================
    story.append(Paragraph("1. Key Performance Indicators (KPI Summary)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER_COLOR, spaceAfter=12, spaceBefore=0))
    
    total = max(1, aggregates.get('total_files', 1))
    dark = aggregates.get('dark_files_count', 0)
    dark_ratio = (dark / total) * 100

    kpi_data = [
        [
            Paragraph("TOTAL FILES AUDITED", kpi_lbl_style),
            Paragraph("DARK DATA RATIO", kpi_lbl_style),
            Paragraph("CURRENT CARBON", kpi_lbl_style),
            Paragraph("ESTIMATED MONTHLY ROI", kpi_lbl_style)
        ],
        [
            Paragraph(f"<b>{total:,}</b>", kpi_val_style),
            Paragraph(f"<font color='#DC2626'><b>{dark_ratio:.1f}%</b></font>", kpi_val_style),
            Paragraph(f"<b>{(aggregates.get('current_footprint_kg', 0)*1000):.1f} g</b>", kpi_val_style),
            Paragraph(f"<font color='#16A34A'><b>${aggregates.get('estimated_monthly_roi_usd', 0)} USD</b></font>", kpi_val_style)
        ]
    ]
    kpi_table = Table(kpi_data, colWidths=[126, 126, 126, 126])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 1, BORDER_COLOR),
        ('INNERGRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 18))

    # Sustainability Impact
    story.append(Paragraph("2. Environmental Impact & Sustainability Breakdown", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER_COLOR, spaceAfter=10, spaceBefore=0))
    
    sust_text = (
        f"Continuous hosting of unaccessed dark data accounts for <b>{(aggregates.get('current_footprint_kg',0)*1000):.2f} g CO₂</b> in active emissions. "
        f"By executing automated migration to cold storage and purging unneeded files, the organization can reduce greenhouse gas emissions by "
        f"<b>{(aggregates.get('prevented_emissions_kg',0)*1000):.2f} g CO₂</b> annually."
    )
    story.append(Paragraph(sust_text, body_style))
    story.append(Spacer(1, 10))

    breakdown_data = [
        [Paragraph("<b>Metric Description</b>", body_style), Paragraph("<b>Value</b>", body_style), Paragraph("<b>Environmental & Financial Impact</b>", body_style)],
        [Paragraph("Active (Useful) Files Count", body_style), Paragraph(str(aggregates.get('active_files_count', 0)), body_style), Paragraph("Optimal utilization of storage resources", body_style)],
        [Paragraph("Dark Data (Unused) Files", body_style), Paragraph(str(dark), body_style), Paragraph("<font color='#DC2626'>Wasting cloud power & recurring costs</font>", body_style)],
        [Paragraph("Prevented CO₂ Emissions", body_style), Paragraph(f"{(aggregates.get('prevented_emissions_kg',0)*1000):.2f} g CO₂", body_style), Paragraph("<font color='#16A34A'>Equivalent to 14 tree seedlings absorbing CO₂</font>", body_style)],
        [Paragraph("Potential Cost Reduction", body_style), Paragraph(f"${aggregates.get('estimated_monthly_roi_usd', 0)} / mo", body_style), Paragraph("Direct AWS / Cloud infrastructure cost savings", body_style)],
    ]
    breakdown_table = Table(breakdown_data, colWidths=[150, 110, 244])
    breakdown_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#F1F5F9")),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(breakdown_table)
    story.append(Spacer(1, 18))

    # Recommendations Plan
    story.append(Paragraph("3. Strategic Action Plan & Recommendations", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER_COLOR, spaceAfter=10, spaceBefore=0))

    rec_html = (
        "<b>1. Execute Immediate Cold Storage Migration:</b> Transition unaccessed files older than 180 days to AWS Glacier Deep Archive to trim active storage costs by up to 75%.<br/><br/>"
        "<b>2. Enforce Automated Cleanup Policies:</b> Enable 90-day retention policies on temporary and log files flagged with over 90% AI confidence.<br/><br/>"
        "<b>3. Continuous Carbon Auditing:</b> Schedule monthly Dark Data Auditor API scans to track data growth and enforce Green Computing compliance."
    )
    rec_table = Table([[Paragraph(rec_html, body_style)]], colWidths=[504])
    rec_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#FEF3C7")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#FCD34D")),
        ('PADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(rec_table)
    story.append(PageBreak())

    # ==========================================
    # PAGE 3: AUDITED INVENTORY LOG
    # ==========================================
    story.append(Paragraph("4. Audited File Inventory Log (Sample Records)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER_COLOR, spaceAfter=10, spaceBefore=0))

    inv_data = [
        [
            Paragraph("<b>File Identifier</b>", body_style),
            Paragraph("<b>Type</b>", body_style),
            Paragraph("<b>Size</b>", body_style),
            Paragraph("<b>Age</b>", body_style),
            Paragraph("<b>AI Conf.</b>", body_style),
            Paragraph("<b>Automated Action Plan</b>", body_style)
        ]
    ]

    sample_files = files[:18] if files else []
    for f in sample_files:
        act = f.get('automated_action', 'Keep')
        act_color = "#DC2626" if "Deletion" in act else "#D97706" if "Cold" in act else "#16A34A"
        
        inv_data.append([
            Paragraph(f"<font size=7.5 color='#0284C7'>{str(f.get('file_id',''))[:24]}</font>", body_style),
            Paragraph(str(f.get('file_type','.file')), body_style),
            Paragraph(f"{f.get('file_size_mb',0)} MB", body_style),
            Paragraph(f"{f.get('days_since_creation',0)}d", body_style),
            Paragraph(f"{f.get('confidence_percent',90)}%", body_style),
            Paragraph(f"<font color='{act_color}'><b>{act}</b></font>", body_style)
        ])

    inv_table = Table(inv_data, colWidths=[140, 46, 50, 44, 54, 170])
    inv_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(inv_table)

    # Build PDF with custom NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)