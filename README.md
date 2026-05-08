# Freelancer Invoices App

Pilnai apdorojama žiniatinklio programa laisvai samdomiems darbuotojams, skirta pajamoms stebėti ir mokesčiams automatiškai apskaičiuoti.

## Technologijų paketas
- Backend'as: Python su „Flask“
- Frontend'as: HTML, CSS, JavaScript
- Duomenų bazė: SQLite

## Funkcijos
- Pridėti naujas sąskaitas faktūras su kliento vardu, suma ir data
- Automatinis mokesčių skaičiavimas (15 % GPM)
- Peržiūrėti visas sąskaitas faktūras lentelėje
- Atnaujinimai realiuoju laiku neperkraunant puslapio

## Nustatyti ir paleisti

1. Įdiegti bibliotekas:
   ```
   pip install -r requirements.txt
   ```

2. Paleisti programą:
   ```
   python app.py
   ```

3. Atidarykite naršyklę ir eikite į `http://127.0.0.1:5000`

## Projekto struktūra
- `app.py`: Pagrindinė „Flask“ programa
- `templates/index.html`: Pagrindinis HTML puslapis
- `static/style.css`: Stilių lapas
- `static/script.js`: Kliento pusės „JavaScript“
- `invoices.db`: SQLite duomenų bazė
- `requirements.txt`: Python priklausomybės
