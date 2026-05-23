from fpdf import FPDF

def generate_invoice_pdf(user, invoice):
    pdf = FPDF()
    pdf.add_page()
    
    # Šriftas palaikantis lietuviškus rašmenis (reikia turėti .ttf failą)
    # pdf.add_font('DejaVu', '', 'DejaVuSans.ttf', uni=True)
    pdf.set_font('Arial', 'B', 16)
    
    # Antraštė
    pdf.cell(190, 10, f"SĄSKAITA FAKTŪRA: {invoice.series_number}", ln=True, align='C')
    pdf.ln(10)
    
    # Pardavėjo (Vartotojo nustatymai) ir Pirkėjo informacija
    pdf.set_font('Arial', '', 12)
    pdf.cell(95, 10, f"PARDAVĖJAS:", ln=0)
    pdf.cell(95, 10, f"PIRKĖJAS:", ln=1)
    
    pdf.cell(95, 7, f"{user.full_name}", ln=0)
    pdf.cell(95, 7, f"{invoice.client_name}", ln=1)
    
    pdf.cell(95, 7, f"IV numeris: {user.iv_number}", ln=0)
    pdf.cell(95, 7, f"Adresas: {invoice.client_address}", ln=1)
    
    pdf.ln(10)
    
    # Paslaugų lentelė
    pdf.set_fill_color(240, 240, 240)
    pdf.cell(130, 10, "Paslaugos aprašymas", 1, 0, 'L', True)
    pdf.cell(60, 10, "Suma", 1, 1, 'C', True)
    
    pdf.cell(130, 10, f"{invoice.description}", 1)
    pdf.cell(60, 10, f"{invoice.amount} {user.currency}", 1, 1, 'C')
    
    pdf.ln(5)
    
    # Mokesčių suvestinė (pagal jūsų mokesčių logiką)
    pdf.cell(130, 10, "GPM mokestis:", 0, 0, 'R')
    pdf.cell(60, 10, f"- {invoice.gpm_amount} {user.currency}", 0, 1, 'C')
    
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(130, 10, "Grynasis pelnas (po mokesčių):", 0, 0, 'R')
    pdf.cell(60, 10, f"{invoice.net_amount} {user.currency}", 0, 1, 'C')
    
    return pdf.output(dest='S').encode('latin-1')

def send_invoice_email(user, invoice, pdf_content):
    from app import mail, app
    from flask_mailman import EmailMessage
    msg = EmailMessage(
        subject=f"Sąskaita faktūra {invoice.series_number}",
        from_email=app.config['MAIL_USERNAME'],
        to=[invoice.client_email]  # Kliento el. paštas iš DB[cite: 1]
    )
    
    msg.body = f"Sveiki, siunčiame sąskaitą už suteiktas paslaugas: {invoice.description}."
    
    # Prikabiname sugeneruotą PDF turinį
    msg.attach(
        filename=f"Saskaita_{invoice.series_number}.pdf",
        content_type="application/pdf",
        data=pdf_content
    )
    
    mail.send(msg)