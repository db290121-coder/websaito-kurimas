from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

# ---------------------------------------------------------------------------
# Multi-country mokesčių konfigūracija
# ---------------------------------------------------------------------------
COUNTRY_TAX_CONFIG = {
    'LT': {
        'name': 'Lietuva',
        'flag': '🇱🇹',
        'gpm_percent': 15.0,
        'expense_deduction_percent': 30.0,
        'vsd_percent': 9.0,
        'psd_percent': 6.98,
        'labels': {
            'income_tax': 'GPM',
            'social': 'VSD',
            'health': 'PSD',
            'expense_deduction': 'Išlaidų atskaitymas',
        },
        'currency': 'EUR',
    },
    'DE': {
        'name': 'Vokietija',
        'flag': '🇩🇪',
        'gpm_percent': 19.0,
        'expense_deduction_percent': 25.0,
        'vsd_percent': 9.3,
        'psd_percent': 7.3,
        'labels': {
            'income_tax': 'Einkommensteuer',
            'social': 'Rentenversicherung',
            'health': 'Krankenversicherung',
            'expense_deduction': 'Betriebsausgaben',
        },
        'currency': 'EUR',
    },
    'PL': {
        'name': 'Lenkija',
        'flag': '🇵🇱',
        'gpm_percent': 12.0,
        'expense_deduction_percent': 20.0,
        'vsd_percent': 9.76,
        'psd_percent': 9.0,
        'labels': {
            'income_tax': 'PIT',
            'social': 'ZUS emerytalny',
            'health': 'ZUS zdrowotny',
            'expense_deduction': 'Koszty uzyskania',
        },
        'currency': 'PLN',
    },
    'EE': {
        'name': 'Estija',
        'flag': '🇪🇪',
        'gpm_percent': 20.0,
        'expense_deduction_percent': 20.0,
        'vsd_percent': 0.0,
        'psd_percent': 13.0,
        'labels': {
            'income_tax': 'Tulumaks',
            'social': 'Sotsiaalmaks',
            'health': 'Ravikindlustus',
            'expense_deduction': 'Kulud',
        },
        'currency': 'EUR',
    },
    'GB': {
        'name': 'Jungtinė Karalystė',
        'flag': '🇬🇧',
        'gpm_percent': 20.0,
        'expense_deduction_percent': 0.0,
        'vsd_percent': 9.0,
        'psd_percent': 0.0,
        'labels': {
            'income_tax': 'Income Tax',
            'social': 'National Insurance',
            'health': 'NHS',
            'expense_deduction': 'Allowable expenses',
        },
        'currency': 'GBP',
    },
    'CUSTOM': {
        'name': 'Kita / Individualūs',
        'flag': '🌍',
        'gpm_percent': 0.0,
        'expense_deduction_percent': 0.0,
        'vsd_percent': 0.0,
        'psd_percent': 0.0,
        'labels': {
            'income_tax': 'Pajamų mokestis',
            'social': 'Socialinis draudimas',
            'health': 'Sveikatos draudimas',
            'expense_deduction': 'Išlaidų atskaitymas',
        },
        'currency': 'EUR',
    },
}


class User(db.Model):
    __tablename__ = 'user'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    account_type = db.Column(db.String(20), nullable=False, default='free')
    activity_type = db.Column(db.String(20), nullable=False, default='freelancer')
    country_code = db.Column(db.String(10), nullable=False, default='LT')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    invoices = db.relationship('Invoice', backref='owner', lazy=True)

    @property
    def tax_config(self):
        return COUNTRY_TAX_CONFIG.get(self.country_code, COUNTRY_TAX_CONFIG['CUSTOM'])

    def __repr__(self):
        return f'<User {self.username} [{self.country_code}]>'

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'account_type': self.account_type,
            'activity_type': self.activity_type,
            'country_code': self.country_code,
        }


class Invoice(db.Model):
    __tablename__ = 'invoices'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    client_name = db.Column(db.String(200), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    date = db.Column(db.String(20), nullable=False)
    tax_paid = db.Column(db.Float, nullable=False)
    expense_deduction_percent = db.Column(db.Float, default=30.0)
    vsd_percent = db.Column(db.Float, default=9.0)
    psd_percent = db.Column(db.Float, default=6.98)
    net_income = db.Column(db.Float)
    gpm = db.Column(db.Float)
    vsd = db.Column(db.Float)
    psd = db.Column(db.Float)
    status = db.Column(db.String(20), default='pending')
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'client_name': self.client_name,
            'amount': self.amount,
            'date': self.date,
            'tax_paid': self.tax_paid,
            'expense_deduction_percent': self.expense_deduction_percent,
            'vsd_percent': self.vsd_percent,
            'psd_percent': self.psd_percent,
            'net_income': self.net_income,
            'gpm': self.gpm,
            'vsd': self.vsd,
            'psd': self.psd,
            'status': self.status,
            'user_id': self.user_id,
        }


class TaxSettings(db.Model):
    __tablename__ = 'tax_settings'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    country = db.Column(db.String(10), unique=True, nullable=False)
    gpm_percent = db.Column(db.Float, default=15.0)
    expense_deduction_percent = db.Column(db.Float, default=30.0)
    vsd_percent = db.Column(db.Float, default=9.0)
    psd_percent = db.Column(db.Float, default=6.98)
    is_custom = db.Column(db.Integer, default=0)
    created_at = db.Column(db.String(50))
    updated_at = db.Column(db.String(50))

    def to_dict(self):
        return {
            'id': self.id,
            'country': self.country,
            'gpm_percent': self.gpm_percent,
            'expense_deduction_percent': self.expense_deduction_percent,
            'vsd_percent': self.vsd_percent,
            'psd_percent': self.psd_percent,
            'is_custom': bool(self.is_custom),
        }