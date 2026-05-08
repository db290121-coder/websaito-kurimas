from flask_cors import CORS
import sqlite3
import os
from datetime import datetime
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)
CORS(app)

DATABASE = 'invoices.db'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_name TEXT NOT NULL,
                amount REAL NOT NULL,
                date TEXT NOT NULL,
                tax_paid REAL NOT NULL,
                expense_deduction_percent REAL DEFAULT 30.0,
                vsd_percent REAL DEFAULT 9.0,
                psd_percent REAL DEFAULT 6.98,
                net_income REAL NOT NULL,
                gpm REAL,
                vsd REAL,
                psd REAL
            )
        ''')
        # Add columns if they don't exist (for migration)
        try:
            conn.execute('ALTER TABLE invoices ADD COLUMN expense_deduction_percent REAL DEFAULT 30.0')
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute('ALTER TABLE invoices ADD COLUMN vsd_percent REAL DEFAULT 9.0')
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute('ALTER TABLE invoices ADD COLUMN psd_percent REAL DEFAULT 6.98')
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute('ALTER TABLE invoices ADD COLUMN net_income REAL')
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute('ALTER TABLE invoices ADD COLUMN gpm REAL')
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute('ALTER TABLE invoices ADD COLUMN vsd REAL')
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute('ALTER TABLE invoices ADD COLUMN psd REAL')
        except sqlite3.OperationalError:
            pass

def calculate_finances(amount, expense_deduction_percent=30.0, vsd_percent=9.0, psd_percent=6.98):
    # Expense deduction (30% of gross amount)
    expense_deduction = amount * (expense_deduction_percent / 100)
    tax_base = amount - expense_deduction
    
    # GPM 15% on full tax base (after expense deduction)
    gpm = tax_base * 0.15
    
    # VSD and PSD calculated on 90% of tax base
    vsd_psd_base = tax_base * 0.9
    vsd = vsd_psd_base * (vsd_percent / 100)
    psd = vsd_psd_base * (psd_percent / 100)
    
    # Total tax
    total_tax = gpm + vsd + psd
    
    # Net income = gross amount - total taxes
    net_income = amount - total_tax
    
    return {
        'tax_paid': total_tax,  # Changed to total tax instead of just GPM
        'net_income': net_income,
        'expense_deduction': expense_deduction,
        'gpm': gpm,
        'vsd': vsd,
        'psd': psd
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/invoices', methods=['GET', 'POST'])
def invoices():
    if request.method == 'POST':
        data = request.get_json()
        client_name = data['client_name']
        amount = float(data['amount'])
        date = data['date']
        expense_deduction_percent = float(data.get('expense_deduction_percent', 30.0))
        vsd_percent = float(data.get('vsd_percent', 9.0))
        psd_percent = float(data.get('psd_percent', 6.98))
        
        finances = calculate_finances(amount, expense_deduction_percent, vsd_percent, psd_percent)
        tax_paid = finances['tax_paid']
        net_income = finances['net_income']
        gpm = finances['gpm']
        vsd = finances['vsd']
        psd = finances['psd']
        
        with get_db() as conn:
            conn.execute('''INSERT INTO invoices 
                         (client_name, amount, date, tax_paid, expense_deduction_percent, vsd_percent, psd_percent, net_income, gpm, vsd, psd) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                         (client_name, amount, date, tax_paid, expense_deduction_percent, vsd_percent, psd_percent, net_income, gpm, vsd, psd))
            conn.commit()
        
        return jsonify({'message': 'Invoice added successfully'}), 201
    
    elif request.method == 'GET':
        with get_db() as conn:
            invoices = conn.execute('SELECT * FROM invoices').fetchall()
        
        result = []
        for row in invoices:
            invoice = dict(row)
            if invoice.get('net_income') is None or invoice.get('gpm') is None:
                # Recalculate for old invoices
                finances = calculate_finances(
                    invoice['amount'], 
                    invoice.get('expense_deduction_percent', 30.0),
                    invoice.get('vsd_percent', 9.0),
                    invoice.get('psd_percent', 6.98)
                )
                invoice['net_income'] = finances['net_income']
                invoice['tax_paid'] = finances['tax_paid']
                invoice['gpm'] = finances['gpm']
                invoice['vsd'] = finances['vsd']
                invoice['psd'] = finances['psd']
                # Optionally update DB, but for now just return
            result.append(invoice)
        return jsonify(result)

@app.route('/api/invoices/<int:invoice_id>', methods=['DELETE'])
def delete_invoice(invoice_id):
    with get_db() as conn:
        cursor = conn.execute('DELETE FROM invoices WHERE id = ?', (invoice_id,))
        if cursor.rowcount == 0:
            return jsonify({'error': 'Invoice not found'}), 404
        conn.commit()
    return jsonify({'message': 'Invoice deleted successfully'})

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=False)
