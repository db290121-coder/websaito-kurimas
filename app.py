from flask import Flask, request, jsonify, render_template
import sqlite3
import os
from datetime import datetime

app = Flask(__name__)

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
                tax_paid REAL NOT NULL
            )
        ''')

def calculate_tax(amount):
    # 15% GPM
    return amount * 0.15

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
        tax_paid = calculate_tax(amount)
        
        with get_db() as conn:
            conn.execute('INSERT INTO invoices (client_name, amount, date, tax_paid) VALUES (?, ?, ?, ?)',
                         (client_name, amount, date, tax_paid))
            conn.commit()
        
        return jsonify({'message': 'Invoice added successfully'}), 201
    
    elif request.method == 'GET':
        with get_db() as conn:
            invoices = conn.execute('SELECT * FROM invoices').fetchall()
        
        result = [dict(row) for row in invoices]
        return jsonify(result)

if __name__ == '__main__':
    init_db()
    app.run(debug=True)
