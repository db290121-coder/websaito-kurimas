let incomeChart;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    const tooltipTriggers = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggers.forEach(function(trigger) {
        new bootstrap.Tooltip(trigger);
    });

    // Set today's date by default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;

    const form = document.getElementById('invoiceForm');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        addInvoice();
    });

    // Load initial data
    refreshDashboard();
});

function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-triangle-exclamation'
    };

    toast.innerHTML = `
        <i class="fa-solid ${icons[type]} toast-icon"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.4s ease-in-out forwards';
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

function calculateTaxValues(invoice) {
    const amount = Number(invoice.amount || 0);
    const expenseDeductionPercent = Number(invoice.expense_deduction_percent ?? invoice.expenseDeductionPercent ?? 30);
    const vsdPercent = Number(invoice.vsd_percent ?? invoice.vsdPercent ?? 9);
    const psdPercent = Number(invoice.psd_percent ?? invoice.psdPercent ?? 6.98);

    const expenseDeduction = amount * (expenseDeductionPercent / 100);
    const taxBase = Math.max(amount - expenseDeduction, 0);
    const gpm = taxBase * 0.15;
    const vsd = amount * (vsdPercent / 100);
    const psd = amount * (psdPercent / 100);
    const totalTax = gpm + vsd + psd;
    const netIncome = amount - totalTax;

    return {
        amount,
        expenseDeduction,
        gpm,
        vsd,
        psd,
        totalTax,
        netIncome
    };
}

function normalizeInvoice(invoice) {
    const finances = calculateTaxValues(invoice);
    return {
        ...invoice,
        calculated_tax: finances.totalTax,
        calculated_net_income: finances.netIncome,
        calculated_gpm: finances.gpm,
        calculated_vsd: finances.vsd,
        calculated_psd: finances.psd
    };
}

function updateStatistics(invoices) {
    if (!invoices.length) {
        document.getElementById('statsContainer').style.display = 'none';
        return;
    }

    document.getElementById('statsContainer').style.display = 'grid';

    let totalAmount = 0;
    let totalTax = 0;
    let totalNet = 0;

    invoices.forEach(invoice => {
        totalAmount += invoice.amount;
        totalTax += invoice.calculated_tax;
        totalNet += invoice.calculated_net_income;
    });

    document.getElementById('totalAmount').textContent = '€ ' + totalAmount.toFixed(2);
    document.getElementById('totalTax').textContent = '€ ' + totalTax.toFixed(2);
    document.getElementById('totalNet').textContent = '€ ' + totalNet.toFixed(2);
    document.getElementById('totalCount').textContent = invoices.length;
}

function refreshDashboard() {
    return fetch('/api/invoices')
        .then(response => response.json())
        .then(data => {
            const normalizedInvoices = data.map(normalizeInvoice);
            const tbody = document.querySelector('#invoiceTable tbody');
            tbody.innerHTML = '';

            updateStatistics(normalizedInvoices);

            if (!normalizedInvoices.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="fa-solid fa-inbox"></i> Dar nėra įvestų sąskaitų. Pradėkite nuo formos viršuje!</td></tr>';
            } else {
                normalizedInvoices.forEach((invoice, index) => {
                    const row = document.createElement('tr');
                    row.style.animationDelay = `${index * 50}ms`;
                    row.innerHTML = `
                        <td>#${invoice.id}</td>
                        <td>${invoice.client_name}</td>
                        <td>€ ${invoice.amount.toFixed(2)}</td>
                        <td>${invoice.date}</td>
                        <td>€ ${invoice.calculated_tax.toFixed(2)}</td>
                        <td>€ ${invoice.calculated_net_income.toFixed(2)}</td>
                        <td class="text-end">
                            <button type="button" class="btn btn-sm btn-outline-danger delete-btn" data-id="${invoice.id}" title="Ištrinti sąskaitą">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
            }

            document.querySelectorAll('.delete-btn').forEach(button => {
                button.addEventListener('click', function() {
                    deleteInvoice(this.dataset.id);
                });
            });

            renderInvoiceChart(normalizedInvoices);
        })
        .catch(error => {
            console.error('Error loading invoices:', error);
            showToast('Klaida kraunant sąskaitas. Pabandykite iš naujo.', 'error');
        });
}

function addInvoice() {
    const client = document.getElementById('client').value.trim();
    const amount = document.getElementById('amount').value;
    const date = document.getElementById('date').value;
    const expenseDeduction = document.getElementById('expenseDeduction').value || 30;
    const vsdPercent = document.getElementById('vsdPercent').value || 9;
    const psdPercent = document.getElementById('psdPercent').value || 6.98;

    // Validation
    if (!client) {
        showToast('Prašau įvesti kliento pavadinimą', 'warning');
        document.getElementById('client').focus();
        return;
    }

    if (!amount || amount <= 0) {
        showToast('Prašau įvesti teisingą sumą', 'warning');
        document.getElementById('amount').focus();
        return;
    }

    if (!date) {
        showToast('Prašau pasirinkti datą', 'warning');
        document.getElementById('date').focus();
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.classList.add('loading-btn');
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pridedama...';

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
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(() => {
        document.getElementById('invoiceForm').reset();
        
        // Set today's date again
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('date').value = today;
        
        showToast('✨ Sąskaita sėkmingai pridėta!', 'success');
        refreshDashboard();
    })
    .catch(error => {
        console.error('Error adding invoice:', error);
        showToast('Klaida pridedant sąskaitą. Pabandykite iš naujo.', 'error');
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading-btn');
        submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Pridėti sąskaitą';
    });
}

function deleteInvoice(invoiceId) {
    if (!confirm('Ar Jūs tikras, kad norite ištrinti šią sąskaitą?')) {
        return;
    }

    fetch(`/api/invoices/${invoiceId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(() => {
        showToast('🗑️ Sąskaita sėkmingai ištrinta!', 'success');
        refreshDashboard();
    })
    .catch(error => {
        console.error('Error deleting invoice:', error);
        showToast('Klaida ištrinant sąskaitą. Pabandykite iš naujo.', 'error');
    });
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
        acc[key].bruto += invoice.amount;
        acc[key].neto += invoice.calculated_net_income;
        acc[key].taxes += invoice.calculated_tax;
        return acc;
    }, {});

    const sortedKeys = Object.keys(monthlyData).sort();
    const labels = sortedKeys.map(key => {
        const [year, month] = key.split('-');
        const monthNames = ['Sausis', 'Vasaris', 'Kovas', 'Balandis', 'Gegužė', 'Birželis',
            'Liepa', 'Rugpjūtis', 'Rugsėjis', 'Spalis', 'Lapkritis', 'Gruodis'];
        return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
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
                backgroundColor: 'rgba(34, 197, 94, 0.85)',
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 2,
                hoverBackgroundColor: 'rgba(34, 197, 94, 1)',
                borderRadius: 12,
                maxBarThickness: 45,
                stack: 'Stack 0'
            }, {
                label: 'Mokesčiai (€)',
                data: taxTotals,
                backgroundColor: 'rgba(239, 68, 68, 0.85)',
                borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 2,
                hoverBackgroundColor: 'rgba(239, 68, 68, 1)',
                borderRadius: 12,
                maxBarThickness: 45,
                stack: 'Stack 0'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#475569', font: { weight: '600' } }
                },
                y: {
                    beginAtZero: true,
                    stacked: true,
                    grid: { color: 'rgba(15, 23, 42, 0.08)', drawBorder: false },
                    ticks: { color: '#475569', font: { weight: '600' } }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#0f172a',
                        font: { weight: '600' },
                        padding: 15,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#ffffff',
                    bodyColor: '#f8fafc',
                    padding: 12,
                    cornerRadius: 12,
                    titleFont: { weight: 'bold' },
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += '€ ' + context.parsed.y.toFixed(2);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}