# Freelancer Invoices App

A full-stack web application for freelancers to track income and automatically calculate taxes.

## Tech Stack
- Backend: Python with Flask
- Frontend: HTML, CSS, JavaScript
- Database: SQLite

## Features
- Add new invoices with client name, amount, and date
- Automatic tax calculation (15% GPM)
- View all invoices in a table
- Real-time updates without page reload

## Setup and Run

1. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Run the application:
   ```
   python app.py
   ```

3. Open your browser and go to `http://127.0.0.1:5000`

## Project Structure
- `app.py`: Main Flask application
- `templates/index.html`: Main HTML page
- `static/style.css`: Stylesheet
- `static/script.js`: Client-side JavaScript
- `invoices.db`: SQLite database
- `requirements.txt`: Python dependencies
