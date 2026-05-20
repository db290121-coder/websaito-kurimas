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
    redirect, url_for, flash, session
)
import bcrypt

from models import db, User, Invoice, TaxSettings, COUNTRY_TAX_CONFIG

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'change-this-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///invoices.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

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
    invoices = Invoice.query.all()
    monthly_data = {}
    for inv in invoices:
        month = datetime.strptime(inv.date, '%Y-%m-%d').strftime('%Y-%m')
        if month not in monthly_data:
            monthly_data[month] = {'amount': 0, 'tax_paid': 0, 'net_income': 0}
        monthly_data[month]['amount'] += inv.amount or 0
        monthly_data[month]['tax_paid'] += inv.tax_paid or 0
        monthly_data[month]['net_income'] += inv.net_income or 0
    sorted_months = sorted(monthly_data.keys())
    return render_template('analytics.html',
        months=sorted_months,
        amounts=[round(monthly_data[m]['amount'], 2) for m in sorted_months],
        taxes=[round(monthly_data[m]['tax_paid'], 2) for m in sorted_months],
        net_incomes=[round(monthly_data[m]['net_income'], 2) for m in sorted_months],
    )


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


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        seed_defaults()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=False)