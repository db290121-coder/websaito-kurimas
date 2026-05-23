import io

from flask_cors import CORS
from flask_wtf.csrf import CSRFProtect
from flask_migrate import Migrate
from flask_login import (
    LoginManager, login_user, logout_user,
    login_required, current_user, UserMixin
)
import os
from datetime import datetime
from flask import (
    Flask, request, jsonify, render_template,
    redirect, url_for, flash, session, send_file
)
import bcrypt

from models import db, User, Invoice, TaxSettings, COUNTRY_TAX_CONFIG
from sqlalchemy import func
from utils import generate_invoice_pdf, send_invoice_email
from flask_mailman import Mail, EmailMessage

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'change-this-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///invoices.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = 'jusu- pastas@gmail.com'
app.config['MAIL_PASSWORD'] = 'jusu-programos-slaptazodis'
mail = Mail(app)

CORS(app)
csrf = CSRFProtect(app)
db.init_app(app)
migrate = Migrate(app, db)

# ---------------------------------------------------------------------------
# Flask-Login setup
# ---------------------------------------------------------------------------
login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Prašome prisijungti.'
login_manager.login_message_category = 'warning'

# Make User work with Flask-Login (mixin pattern without changing models.py)
User.get_id = lambda self: str(self.id)
User.is_authenticated = property(lambda self: True)
User.is_active = property(lambda self: True)
User.is_anonymous = property(lambda self: False)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# ---------------------------------------------------------------------------
# Finansų skaičiavimas
# ---------------------------------------------------------------------------
def calculate_finances(amount, expense_deduction_percent=30.0, vsd_percent=9.0, psd_percent=6.98):
    expense_deduction = amount * (expense_deduction_percent / 100)
    tax_base = amount - expense_deduction
    gpm = tax_base * 0.15
    vsd_psd_base = tax_base * 0.9
    vsd = vsd_psd_base * (vsd_percent / 100)
    psd = vsd_psd_base * (psd_percent / 100)
    total_tax = gpm + vsd + psd
    return {
        'tax_paid': total_tax,
        'net_income': amount - total_tax,
        'expense_deduction': expense_deduction,
        'gpm': gpm,
        'vsd': vsd,
        'psd': psd,
    }


def seed_defaults():
    if not TaxSettings.query.filter_by(country='LT').first():
        db.session.add(TaxSettings(
            country='LT', gpm_percent=15.0, expense_deduction_percent=30.0,
            vsd_percent=9.0, psd_percent=6.98, is_custom=0,
        ))
        db.session.commit()


# ---------------------------------------------------------------------------
# Auth maršrutai
# ---------------------------------------------------------------------------

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))

    if request.method == 'POST':
        username   = request.form.get('username', '').strip()
        email      = request.form.get('email', '').strip().lower()
        password   = request.form.get('password', '')
        password2  = request.form.get('password2', '')
        activity   = request.form.get('activity_type', 'freelancer')
        country    = request.form.get('country_code', 'LT')

        # Validacija
        errors = []
        if not username or len(username) < 3:
            errors.append('Vartotojo vardas per trumpas (mažiausiai 3 simboliai).')
        if not email or '@' not in email:
            errors.append('Neteisingas el. pašto adresas.')
        if len(password) < 8:
            errors.append('Slaptažodis turi būti bent 8 simbolių.')
        if password != password2:
            errors.append('Slaptažodžiai nesutampa.')
        if User.query.filter_by(username=username).first():
            errors.append('Toks vartotojo vardas jau užimtas.')
        if User.query.filter_by(email=email).first():
            errors.append('Šis el. paštas jau registruotas.')
        if country not in COUNTRY_TAX_CONFIG:
            country = 'LT'

        if errors:
            for e in errors:
                flash(e, 'danger')
            return render_template(
                'register.html',
                countries=COUNTRY_TAX_CONFIG,
                form_data={'username': username, 'email': email,
                           'activity_type': activity, 'country_code': country},
            )

        pw_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user = User(
            username=username,
            email=email,
            password_hash=pw_hash,
            activity_type=activity,
            country_code=country,
            account_type='free',
        )
        db.session.add(user)
        db.session.commit()
        login_user(user)
        flash(f'Sveiki, {username}! Paskyra sukurta sėkmingai.', 'success')
        return redirect(url_for('index'))

    return render_template('register.html', countries=COUNTRY_TAX_CONFIG, form_data={})


@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))

    if request.method == 'POST':
        identifier = request.form.get('identifier', '').strip()
        password   = request.form.get('password', '')
        remember   = bool(request.form.get('remember'))

        # Ieškome pagal username ARBA email
        user = (User.query.filter_by(username=identifier).first() or
                User.query.filter_by(email=identifier.lower()).first())

        if user and bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
            login_user(user, remember=remember)
            next_page = request.args.get('next') or url_for('index')
            flash(f'Sveiki sugrįžę, {user.username}!', 'success')
            return redirect(next_page)

        flash('Neteisingas vartotojo vardas / el. paštas arba slaptažodis.', 'danger')

    return render_template('login.html')


@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Atsijungėte sėkmingai.', 'info')
    return redirect(url_for('login'))


# ---------------------------------------------------------------------------
# Pagrindai puslapiai
# ---------------------------------------------------------------------------

@app.route('/')
@app.route('/index.html')
def index():
    invoices = Invoice.query.all()
    total_amount = total_taxes = total_net_income = 0
    for inv in invoices:
        amount = inv.amount or 0
        if inv.tax_paid is None or inv.net_income is None:
            f = calculate_finances(amount, inv.expense_deduction_percent or 30.0,
                                   inv.vsd_percent or 9.0, inv.psd_percent or 6.98)
            total_taxes += f['tax_paid']
            total_net_income += f['net_income']
        else:
            total_taxes += inv.tax_paid or 0
            total_net_income += inv.net_income or 0
        total_amount += amount

    return render_template('index.html',
        total_amount=round(total_amount, 2),
        total_taxes=round(total_taxes, 2),
        total_net_income=round(total_net_income, 2),
        invoice_count=len(invoices),
    )


@app.route('/archive.html')
def archive():
    return render_template('archive.html', invoices=Invoice.query.all())


@app.route('/analytics.html')
def analytics():
    return render_template('analytics.html')


@app.route('/settings.html')
def settings():
    return render_template('settings.html', settings=TaxSettings.query.all())


# ---------------------------------------------------------------------------
# API: Sąskaitos
# ---------------------------------------------------------------------------

@app.route('/api/invoices', methods=['GET', 'POST'])
@csrf.exempt
def invoices_api():
    if request.method == 'POST':
        data = request.get_json()
        amount = float(data['amount'])
        edp = float(data.get('expense_deduction_percent', 30.0))
        vp  = float(data.get('vsd_percent', 9.0))
        pp  = float(data.get('psd_percent', 6.98))
        f   = calculate_finances(amount, edp, vp, pp)
        inv = Invoice(
            client_name=data['client_name'], amount=amount, date=data['date'],
            tax_paid=f['tax_paid'], expense_deduction_percent=edp,
            vsd_percent=vp, psd_percent=pp, net_income=f['net_income'],
            gpm=f['gpm'], vsd=f['vsd'], psd=f['psd'],
            status=data.get('status', 'pending'),
            user_id=current_user.id if current_user.is_authenticated else None,
        )
        db.session.add(inv)
        db.session.commit()
        return jsonify({'message': 'Invoice added successfully'}), 201

    result = []
    for inv in Invoice.query.all():
        d = inv.to_dict()
        if inv.net_income is None or inv.gpm is None:
            f = calculate_finances(inv.amount, inv.expense_deduction_percent or 30.0,
                                   inv.vsd_percent or 9.0, inv.psd_percent or 6.98)
            d.update({'net_income': f['net_income'], 'tax_paid': f['tax_paid'],
                      'gpm': f['gpm'], 'vsd': f['vsd'], 'psd': f['psd']})
        result.append(d)
    return jsonify(result)


@app.route('/api/invoices/<int:invoice_id>', methods=['DELETE'])
@csrf.exempt
def delete_invoice(invoice_id):
    inv = Invoice.query.get(invoice_id)
    if not inv:
        return jsonify({'error': 'Invoice not found'}), 404
    db.session.delete(inv)
    db.session.commit()
    return jsonify({'message': 'Invoice deleted successfully'})


@app.route('/api/invoices/<int:invoice_id>/status', methods=['PATCH'])
@csrf.exempt
def update_invoice_status(invoice_id):
    data   = request.get_json()
    status = data.get('status', 'pending')
    if status not in ['pending', 'paid']:
        return jsonify({'error': 'Invalid status'}), 400
    inv = Invoice.query.get(invoice_id)
    if not inv:
        return jsonify({'error': 'Invoice not found'}), 404
    inv.status = status
    db.session.commit()
    return jsonify({'message': 'Status updated', 'status': status}), 200


# ---------------------------------------------------------------------------
# API: Analytics – agregacijos pagal metus / rodinį
# ---------------------------------------------------------------------------

@app.route('/api/analytics', methods=['GET'])
def analytics_api():
    """
    Parametrai:
      ?year=2026          – filtruoti pagal metus (default: visi)
      ?view=taxes         – 'profit' arba 'taxes' (default: 'profit')
    Grąžina:
      monthly   – mėnesiniai duomenys (labels + serijos)
      yearly    – metiniai suvestiniai
      totals    – bendros sumos
      kpi       – change_pct, invoice_count, avg_invoice
    """
    year_param = request.args.get('year', 'all')
    # view param perduodamas frontendui – backend grąžina abu rinkinius visada
    user_id = current_user.id if current_user.is_authenticated else None

    # Bazinė užklausa – tik prisijungusio vartotojo sąskaitos
    base_q = Invoice.query
    if user_id:
        base_q = base_q.filter(Invoice.user_id == user_id)

    # Metų filtras
    if year_param and year_param != 'all':
        base_q = base_q.filter(Invoice.date.like(f'{year_param}%'))

    invoices = base_q.order_by(Invoice.date.asc()).all()

    # ── Mėnesinė agregacija ──────────────────────────────────────
    monthly_map = {}
    for inv in invoices:
        if not inv.date:
            continue
        month = inv.date[:7]  # YYYY-MM
        if month not in monthly_map:
            monthly_map[month] = {'bruto': 0.0, 'neto': 0.0, 'taxes': 0.0,
                                  'gpm': 0.0, 'vsd': 0.0, 'psd': 0.0, 'count': 0}
        amount = inv.amount or 0.0
        # Skaičiuojame iš DB laukų; jei nėra – skaičiuojame on-the-fly
        if inv.net_income is not None and inv.tax_paid is not None:
            neto  = inv.net_income
            taxes = inv.tax_paid
            gpm   = inv.gpm   or 0.0
            vsd   = inv.vsd   or 0.0
            psd   = inv.psd   or 0.0
        else:
            f = calculate_finances(amount,
                inv.expense_deduction_percent or 30.0,
                inv.vsd_percent or 9.0,
                inv.psd_percent or 6.98)
            neto  = f['net_income']
            taxes = f['tax_paid']
            gpm   = f['gpm']
            vsd   = f['vsd']
            psd   = f['psd']

        monthly_map[month]['bruto']  += amount
        monthly_map[month]['neto']   += neto
        monthly_map[month]['taxes']  += taxes
        monthly_map[month]['gpm']    += gpm
        monthly_map[month]['vsd']    += vsd
        monthly_map[month]['psd']    += psd
        monthly_map[month]['count']  += 1

    month_names_lt = ['Sau','Vas','Kov','Bal','Geg','Bir','Lie','Rug','Rgs','Spa','Lap','Grd']
    sorted_months = sorted(monthly_map.keys())

    def fmt_label(ym):
        yr, mo = ym.split('-')
        return f"{month_names_lt[int(mo)-1]} {yr}"

    monthly = {
        'labels':  [fmt_label(m) for m in sorted_months],
        'bruto':   [round(monthly_map[m]['bruto'],  2) for m in sorted_months],
        'neto':    [round(monthly_map[m]['neto'],   2) for m in sorted_months],
        'taxes':   [round(monthly_map[m]['taxes'],  2) for m in sorted_months],
        'gpm':     [round(monthly_map[m]['gpm'],    2) for m in sorted_months],
        'vsd':     [round(monthly_map[m]['vsd'],    2) for m in sorted_months],
        'psd':     [round(monthly_map[m]['psd'],    2) for m in sorted_months],
    }

    # ── Metinė agregacija ────────────────────────────────────────
    yearly_map = {}
    for ym, d in monthly_map.items():
        yr = ym[:4]
        if yr not in yearly_map:
            yearly_map[yr] = {'bruto': 0.0, 'neto': 0.0, 'taxes': 0.0, 'count': 0}
        for k in ('bruto', 'neto', 'taxes', 'count'):
            yearly_map[yr][k] += d[k]
    sorted_years = sorted(yearly_map.keys())
    yearly = {
        'labels': sorted_years,
        'bruto':  [round(yearly_map[y]['bruto'],  2) for y in sorted_years],
        'neto':   [round(yearly_map[y]['neto'],   2) for y in sorted_years],
        'taxes':  [round(yearly_map[y]['taxes'],  2) for y in sorted_years],
    }

    # ── Totals ───────────────────────────────────────────────────
    total_bruto = sum(d['bruto'] for d in monthly_map.values())
    total_neto  = sum(d['neto']  for d in monthly_map.values())
    total_taxes = sum(d['taxes'] for d in monthly_map.values())
    total_gpm   = sum(d['gpm']   for d in monthly_map.values())
    total_vsd   = sum(d['vsd']   for d in monthly_map.values())
    total_psd   = sum(d['psd']   for d in monthly_map.values())
    total_count = len(invoices)

    # ── KPI: mėnesio pokytis ─────────────────────────────────────
    change_pct = 0.0
    if len(sorted_months) >= 2:
        prev = monthly_map[sorted_months[-2]]['neto']
        curr = monthly_map[sorted_months[-1]]['neto']
        change_pct = round((curr - prev) / prev * 100, 1) if prev > 0 else (100.0 if curr > 0 else 0.0)
    elif len(sorted_months) == 1:
        change_pct = 0.0

    avg_invoice = round(total_bruto / total_count, 2) if total_count else 0.0

    # ── SQLAlchemy func.sum() suvestinė (per vartotoją) ─────────
    agg_q = db.session.query(
        func.sum(Invoice.amount).label('sum_amount'),
        func.sum(Invoice.tax_paid).label('sum_tax'),
        func.sum(Invoice.net_income).label('sum_net'),
        func.count(Invoice.id).label('count')
    )
    if user_id:
        agg_q = agg_q.filter(Invoice.user_id == user_id)
    if year_param and year_param != 'all':
        agg_q = agg_q.filter(Invoice.date.like(f'{year_param}%'))
    agg = agg_q.one()

    return jsonify({
        'monthly':  monthly,
        'yearly':   yearly,
        'totals': {
            'bruto':  round(total_bruto, 2),
            'neto':   round(total_neto,  2),
            'taxes':  round(total_taxes, 2),
            'gpm':    round(total_gpm,   2),
            'vsd':    round(total_vsd,   2),
            'psd':    round(total_psd,   2),
            'count':  total_count,
            'avg_invoice': avg_invoice,
            # DB-level aggregation cross-check
            'db_sum_amount': round(float(agg.sum_amount or 0), 2),
            'db_sum_tax':    round(float(agg.sum_tax    or 0), 2),
            'db_sum_net':    round(float(agg.sum_net    or 0), 2),
        },
        'kpi': {
            'change_pct':    change_pct,
            'invoice_count': total_count,
            'avg_invoice':   avg_invoice,
        },
        'available_years': sorted(set(inv.date[:4] for inv in
            (Invoice.query.filter(Invoice.user_id == user_id) if user_id else Invoice.query).all()
            if inv.date)),
    })


# ---------------------------------------------------------------------------
# API: Mokesčių nustatymai
# ---------------------------------------------------------------------------

@app.route('/api/tax-settings', methods=['GET'])
def get_tax_settings():
    return jsonify([s.to_dict() for s in TaxSettings.query.all()])


@app.route('/api/tax-settings/countries', methods=['GET'])
def get_country_configs():
    """Grąžina visą COUNTRY_TAX_CONFIG žodyną (JS naudoja auto-fill)."""
    return jsonify(COUNTRY_TAX_CONFIG)


@app.route('/api/tax-settings/<country>', methods=['GET', 'POST'])
@csrf.exempt
def tax_settings_api(country):
    if request.method == 'GET':
        # Pirma žiūrim į DB, paskui į statinį konfigą
        s = TaxSettings.query.filter_by(country=country).first()
        if s:
            return jsonify(s.to_dict())
        cfg = COUNTRY_TAX_CONFIG.get(country)
        if cfg:
            return jsonify({**cfg, 'country': country})
        return jsonify({'error': 'Country not found'}), 404

    data = request.get_json()
    s = TaxSettings.query.filter_by(country=country).first()
    if not s:
        s = TaxSettings(country=country)
        db.session.add(s)
    s.gpm_percent = float(data.get('gpm_percent', 15.0))
    s.expense_deduction_percent = float(data.get('expense_deduction_percent', 30.0))
    s.vsd_percent = float(data.get('vsd_percent', 9.0))
    s.psd_percent = float(data.get('psd_percent', 6.98))
    s.is_custom   = int(data.get('is_custom', 0))
    s.updated_at  = datetime.now().isoformat()
    db.session.commit()
    return jsonify({'message': 'Tax settings updated'}), 200

@app.route('/download-invoice/<int:invoice_id>')
def download_invoice(invoice_id):
    user = User.query.get(current_user.id) # Gaunami rekvizitai iš nustatymų
    invoice = Invoice.query.get(invoice_id)
    
    pdf_content = generate_invoice_pdf(user, invoice)
    
    return send_file(
        io.BytesIO(pdf_content),
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f"Saskaita_{invoice.series_number}.pdf"
    )

@app.route('/send-invoice/<int:invoice_id>')
def send_invoice(invoice_id):
    user = User.query.get(current_user.id)
    invoice = Invoice.query.get(invoice_id)
    
    # Sugeneruojame PDF turinį
    pdf_content = generate_invoice_pdf(user, invoice)
    # Išsiunčiame el. paštu
    send_invoice_email(user, invoice, pdf_content)
    
    return "Sąskaita sėkmingai išsiųsta klientui!"

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        seed_defaults()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=False)