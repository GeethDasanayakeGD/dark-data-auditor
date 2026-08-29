import io
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_pdf_report(aggregates, files):
    """
    Generates a PDF audit report in memory using ReportLab.
    Returns a BytesIO buffer containing the PDF file data.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    story = []
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#1E293B'),
        spaceAfter=12
    )
    subtitle_style = ParagraphStyle(
        'SubTitleStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#64748B'),
        spaceAfter=20
    )
    section_style = ParagraphStyle(
        'SectionStyle',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#0F172A'),
        spaceAfter=10
    )

    # Document Header
    story.append(Paragraph("Dark Data Audit & Sustainability Report", title_style))
    story.append(Paragraph("Automated Cloud Storage & Carbon Footprint Analysis", subtitle_style))
    story.append(Spacer(1, 10))

    # Aggregate Statistics Table
    story.append(Paragraph("Executive Summary", section_style))
    summary_data = [
        ["Metric", "Value"],
        ["Total Files Audited", str(aggregates.get('total_files', 0))],
        ["Dark Data Files Identified", str(aggregates.get('dark_files_count', 0))],
        ["Active Files Count", str(aggregates.get('active_files_count', 0))],
        ["Current Carbon Footprint", f"{aggregates.get('current_footprint_kg', 0) * 1000:.2f} g CO2"],
        ["Prevented Emissions", f"{aggregates.get('prevented_emissions_kg', 0) * 1000:.2f} g CO2"],
        ["Estimated Monthly ROI", f"${aggregates.get('estimated_monthly_roi_usd', 0)} USD"]
    ]

    summary_table = Table(summary_data, colWidths=[250, 250])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F8FAFC')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E2E8F0'))
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 20))

    # Top Flagged Dark Files
    story.append(Paragraph("Top Flagged Dark Files", section_style))
    file_table_data = [["File ID", "Type", "Size (MB)", "Carbon (g)", "Action"]]

    # Pick top 15 dark files for report preview
    dark_files = [f for f in files if f.get('automated_action') != 'Retain Active Tier'][:15]
    for f in dark_files:
        file_table_data.append([
            str(f.get('file_id', 'N/A'))[:20],
            str(f.get('file_type', 'N/A')),
            str(f.get('file_size_mb', 0)),
            f"{f.get('carbon_kg', 0) * 1000:.2f}",
            str(f.get('automated_action', 'N/A'))
        ])

    file_table = Table(file_table_data, colWidths=[130, 60, 70, 80, 160])
    file_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#334155')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1'))
    ]))
    story.append(file_table)

    # Build PDF document
    doc.build(story)
    buffer.seek(0)
    return buffer