let incomeChart;

document.addEventListener('DOMContentLoaded', function() {
    const tooltipTriggers = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggers.forEach(function(trigger) {
        new bootstrap.Tooltip(trigger);
    });

    const form = document.getElementById('invoiceForm');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        addInvoice();
    });

    refreshDashboard();
});

function refreshDashboard() {
    return fetch('/api/invoices')
        .then(response => response.json())
        .then(data => {
            const tbody = document.querySelector('#invoiceTable tbody');
            tbody.innerHTML = '';

            if (!data.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Dar nėra įvestų sąskaitų.</td></tr>';
            }

            data.forEach(invoice => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="text-secondary small">${invoice.id}</td>
                    <td class="small">${invoice.client_name}</td>
                    <td class="small">€ ${parseFloat(invoice.amount).toFixed(2)}</td>
                    <td class="small">${invoice.date}</td>
                    <td class="tax-highlight small">€ ${parseFloat(invoice.tax_paid).toFixed(2)}</td>
                    <td class="net-highlight small">€ ${parseFloat(invoice.net_income || 0).toFixed(2)}</td>
                    <td class="text-end">
                        <button type="button" class="btn btn-sm btn-outline-danger delete-btn" data-id="${invoice.id}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });

            document.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', function() {
                    deleteInvoice(this.dataset.id);
                });
            });

            renderInvoiceChart(data);
        })
        .catch(error => console.error('Error loading invoices:', error));
}

function addInvoice() {
    const client = document.getElementById('client').value.trim();
    const amount = document.getElementById('amount').value;
    const date = document.getElementById('date').value;
    const expenseDeduction = document.getElementById('expenseDeduction').value || 30;
    const vsdPercent = document.getElementById('vsdPercent').value || 9;
    const psdPercent = document.getElementById('psdPercent').value || 6.98;

    if (!client || !amount || !date) {
        return;
    }

    fetch('/api/invoices', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_name: client,
            amount: parseFloat(amount),
            date: date,
            expense_deduction_percent: parseFloat(expenseDeduction),
            vsd_percent: parseFloat(vsdPercent),
            psd_percent: parseFloat(psdPercent)
        })
    })
    .then(response => response.json())
    .then(() => {
        document.getElementById('invoiceForm').reset();
        refreshDashboard();
    })
    .catch(error => console.error('Error adding invoice:', error));
}

function deleteInvoice(invoiceId) {
    fetch(`/api/invoices/${invoiceId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(() => {
        refreshDashboard();
    })
    .catch(error => console.error('Error deleting invoice:', error));
}

function renderInvoiceChart(invoices) {
    const ctx = document.getElementById('incomeChart');
    if (!ctx) {
        return;
    }

    const monthlyData = invoices.reduce((acc, invoice) => {
        const [year, month] = invoice.date.split('-');
        if (!year || !month) return acc;
        const key = `${year}-${month}`;
        if (!acc[key]) acc[key] = { bruto: 0, neto: 0, taxes: 0 };
        acc[key].bruto += parseFloat(invoice.amount || 0);
        acc[key].neto += parseFloat(invoice.net_income || 0);
        acc[key].taxes += parseFloat(invoice.amount || 0) - parseFloat(invoice.net_income || 0);
        return acc;
    }, {});

    const sortedKeys = Object.keys(monthlyData).sort();
    const labels = sortedKeys.map(key => {
        const [year, month] = key.split('-');
        return `${month}/${year}`;
    });
    const brutoTotals = sortedKeys.map(key => Number(monthlyData[key].bruto.toFixed(2)));
    const netoTotals = sortedKeys.map(key => Number(monthlyData[key].neto.toFixed(2)));
    const taxTotals = sortedKeys.map(key => Number(monthlyData[key].taxes.toFixed(2)));

    if (!labels.length) {
        labels.push('Nėra duomenų');
        brutoTotals.push(0);
        netoTotals.push(0);
        taxTotals.push(0);
    }

    if (incomeChart) {
        incomeChart.destroy();
    }

    incomeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Likutis į rankas (€)',
                data: netoTotals,
                backgroundColor: 'rgba(34, 197, 94, 0.75)',
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 1,
                hoverBackgroundColor: 'rgba(34, 197, 94, 0.9)',
                borderRadius: 12,
                maxBarThickness: 40,
                stack: 'Stack 0'
            }, {
                label: 'Mokesčiai (€)',
                data: taxTotals,
                backgroundColor: 'rgba(239, 68, 68, 0.75)',
                borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 1,
                hoverBackgroundColor: 'rgba(239, 68, 68, 0.9)',
                borderRadius: 12,
                maxBarThickness: 40,
                stack: 'Stack 0'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#475569' }
                },
                y: {
                    beginAtZero: true,
                    stacked: true,
                    grid: { color: 'rgba(15, 23, 42, 0.08)' },
                    ticks: { color: '#475569' }
                }
            },
            plugins: {
                legend: { display: true },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#ffffff',
                    bodyColor: '#f8fafc',
                    padding: 12,
                    cornerRadius: 12
                }
            }
        }
    });
}
