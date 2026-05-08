let incomeChart;
const STORAGE_KEY = 'invoices_cache';
const STORAGE_TIMESTAMP = 'invoices_timestamp';
let invoices = [];
let nextId = 1;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    const tooltipTriggers = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggers.forEach(function(trigger) {
        new bootstrap.Tooltip(trigger);
    });

    // Set today's date by default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;

    // Load initial data from localStorage
    invoices = getFromLocalStorage() || [];
    if (invoices.length > 0) {
        nextId = Math.max(...invoices.map(inv => inv.id)) + 1;
    }

    const form = document.getElementById('invoiceForm');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        addInvoice();
    });

    // Load initial data
    refreshDashboard();

    // Setup tooltips
    setupTooltips();

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        html.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        if (currentTheme === 'dark') {
            html.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
        } else {
            html.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }
        // Refresh chart with new theme
        refreshDashboard();
    });
});

function setupTooltips() {
    const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltips.forEach(el => {
        if (!bootstrap.Tooltip.getInstance(el)) {
            new bootstrap.Tooltip(el);
        }
    });
}

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

    // Expense deduction (30% of gross amount)
    const expenseDeduction = amount * (expenseDeductionPercent / 100);
    const taxBase = amount - expenseDeduction;
    
    // GPM 15% on full tax base (after expense deduction)
    const gpm = taxBase * 0.15;
    
    // VSD and PSD calculated on 90% of tax base
    const vsdPsdBase = taxBase * 0.9;
    const vsd = vsdPsdBase * (vsdPercent / 100);
    const psd = vsdPsdBase * (psdPercent / 100);
    
    // Total tax
    const totalTax = gpm + vsd + psd;
    
    // Net income = gross amount - total taxes
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

function saveToLocalStorage(invoices) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
        localStorage.setItem(STORAGE_TIMESTAMP, new Date().toISOString());
    } catch (e) {
        console.warn('localStorage save failed:', e);
    }
}

function getFromLocalStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.warn('localStorage read failed:', e);
        return null;
    }
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

function updateSummary(invoices) {
    if (!invoices.length) {
        document.getElementById('summaryCard').style.display = 'none';
        return;
    }

    document.getElementById('summaryCard').style.display = 'block';

    let totalGPM = 0;
    let totalVSD = 0;
    let totalPSD = 0;
    let totalAmount = 0;

    invoices.forEach(invoice => {
        totalGPM += invoice.calculated_gpm;
        totalVSD += invoice.calculated_vsd;
        totalPSD += invoice.calculated_psd;
        totalAmount += invoice.amount;
    });

    const avgGPMPercent = totalAmount > 0 ? ((totalGPM / totalAmount) * 100) : 0;

    document.getElementById('summaryGPM').textContent = '€ ' + totalGPM.toFixed(2);
    document.getElementById('summaryGPMPercent').textContent = avgGPMPercent.toFixed(2) + ' %';
    document.getElementById('summaryVSD').textContent = '€ ' + totalVSD.toFixed(2);
    document.getElementById('summaryPSD').textContent = '€ ' + totalPSD.toFixed(2);
}

function downloadPDF(invoice) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.text('Sąskaita', 20, 20);
    
    // Details
    doc.setFontSize(11);
    let yPos = 40;
    
    const details = [
        ['Sąskaitos ID:', `#${invoice.id}`],
        ['Klientas:', invoice.client_name],
        ['Data:', invoice.date],
        ['Suma (Bruto):', `€ ${invoice.amount.toFixed(2)}`],
        ['Mokesčiai:', `€ ${invoice.calculated_tax.toFixed(2)}`],
        ['Likutis į rankas:', `€ ${invoice.calculated_net_income.toFixed(2)}`]
    ];
    
    details.forEach(([label, value]) => {
        doc.text(label, 20, yPos);
        doc.text(value, 100, yPos);
        yPos += 8;
    });
    
    // Breakdown
    yPos += 10;
    doc.setFontSize(12);
    doc.text('Mokesčių skaičiavimai:', 20, yPos);
    
    yPos += 8;
    doc.setFontSize(10);
    const breakdown = [
        [`GPM (15%):`, `€ ${invoice.calculated_gpm.toFixed(2)}`],
        [`VSD:`, `€ ${invoice.calculated_vsd.toFixed(2)}`],
        [`PSD:`, `€ ${invoice.calculated_psd.toFixed(2)}`]
    ];
    
    breakdown.forEach(([label, value]) => {
        doc.text(label, 20, yPos);
        doc.text(value, 100, yPos);
        yPos += 8;
    });
    
    const filename = `Saskaitа_${invoice.id}_${invoice.date}.pdf`;
    doc.save(filename);
    showToast(`📄 PDF sėkmingai atsisiųstas!`, 'success');
}

function refreshDashboard() {
    console.log('Current invoices:', invoices);
    
    const normalizedInvoices = invoices.map(normalizeInvoice);
    
    // Save to localStorage
    saveToLocalStorage(normalizedInvoices);
    
    const tbody = document.querySelector('#invoiceTable tbody');
    if (!tbody) {
        console.error('Table body NOT found!');
        return;
    }
    tbody.innerHTML = '';
    
    updateStatistics(normalizedInvoices);
    updateSummary(normalizedInvoices);
    
    if (!normalizedInvoices.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No data</td></tr>';
    } else {
        normalizedInvoices.forEach((invoice, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>#${invoice.id}</td>
                <td>${invoice.client}</td>
                <td>€ ${invoice.amount.toFixed(2)}</td>
                <td>${new Date(invoice.date).toLocaleDateString('lt-LT')}</td>
                <td>€ ${invoice.calculated_tax.toFixed(2)}</td>
                <td>€ ${invoice.calculated_net_income.toFixed(2)}</td>
                <td><button class="btn btn-sm btn-outline-danger delete-btn" data-id="${invoice.id}">Delete</button></td>
                <td><button class="btn btn-sm btn-outline-primary download-pdf-btn" data-invoice='${JSON.stringify(invoice)}'>PDF</button></td>
            `;
            tbody.appendChild(row);
        });
    }
    
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', function() {
            deleteInvoice(this.dataset.id);
        });
    });
    
    document.querySelectorAll('.download-pdf-btn').forEach(button => {
        button.addEventListener('click', function() {
            const invoice = JSON.parse(this.getAttribute('data-invoice'));
            downloadPDF(invoice);
        });
    });
    
    updateChart(normalizedInvoices);
    setupTooltips();
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

    // Create invoice object
    const newInvoice = {
        id: nextId++,
        client: client,
        amount: parseFloat(amount),
        date: date,
        expense_deduction_percent: parseFloat(expenseDeduction),
        vsd_percent: parseFloat(vsdPercent),
        psd_percent: parseFloat(psdPercent)
    };

    // Add to local array
    invoices.push(newInvoice);

    // Save to localStorage
    saveToLocalStorage(invoices);

    // Reset form
    document.getElementById('invoiceForm').reset();
    
    // Set today's date again
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
    
    showToast('✨ Sąskaita sėkmingai pridėta!', 'success');
    
    // Refresh dashboard
    refreshDashboard();
    
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading-btn');
    submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Pridėti sąskaitą';
}

function deleteInvoice(invoiceId) {
    if (!confirm('Ar Jūs tikras, kad norite ištrinti šią sąskaitą?')) {
        return;
    }

    // Remove from local array
    invoices = invoices.filter(inv => inv.id != invoiceId);

    // Save to localStorage
    saveToLocalStorage(invoices);

    showToast('🗑️ Sąskaita sėkmingai ištrinta!', 'success');
    
    refreshDashboard();
}

function updateChart(invoices) {
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
                    ticks: { color: 'var(--chart-text)', font: { weight: '600' } }
                },
                y: {
                    beginAtZero: true,
                    stacked: true,
                    grid: { color: 'var(--chart-grid)', drawBorder: false },
                    ticks: { color: 'var(--chart-text)', font: { weight: '600' } }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: 'var(--chart-text)',
                        font: { weight: '600' },
                        padding: 15,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: 'var(--surface)',
                    titleColor: 'var(--text)',
                    bodyColor: 'var(--muted)',
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
// Initialize dashboard on script load
//refreshDashboard();
