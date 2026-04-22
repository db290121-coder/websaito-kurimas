document.addEventListener('DOMContentLoaded', function() {
    loadInvoices();
    
    const form = document.getElementById('invoiceForm');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        addInvoice();
    });
});

function loadInvoices() {
    fetch('/api/invoices')
        .then(response => response.json())
        .then(data => {
            const tbody = document.querySelector('#invoicesTable tbody');
            tbody.innerHTML = '';
            data.forEach(invoice => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${invoice.id}</td>
                    <td>${invoice.client_name}</td>
                    <td>${invoice.amount}</td>
                    <td>${invoice.date}</td>
                    <td>${invoice.tax_paid}</td>
                `;
                tbody.appendChild(row);
            });
        })
        .catch(error => console.error('Error loading invoices:', error));
}

function addInvoice() {
    const client_name = document.getElementById('client_name').value;
    const amount = document.getElementById('amount').value;
    const date = document.getElementById('date').value;
    
    fetch('/api/invoices', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_name: client_name,
            amount: parseFloat(amount),
            date: date
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Invoice added:', data);
        document.getElementById('invoiceForm').reset();
        loadInvoices(); // Reload the table
    })
    .catch(error => console.error('Error adding invoice:', error));
}
