let incomeChart;
let miniChart;
let ratioChart;
let yearlyChart;
const STORAGE_KEY = 'invoices_cache';
const STORAGE_TIMESTAMP = 'invoices_timestamp';
const SETTINGS_KEY = 'invoice_settings';
const DEFAULT_SETTINGS = {
    gpmPercent: 15,
    expenseDeductionPercent: 30,
    vsdPercent: 9,
    psdPercent: 6.98
};
let invoices = [];
let nextId = 1;
let settings = loadSettings();

document.addEventListener('DOMContentLoaded', function() {
    const tooltipTriggers = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    const hamburger = document.getElementById('hamburger');
    const menu = document.getElementById('mobile-menu');

    if (hamburger && menu) {
        hamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menu.classList.toggle('active');
            hamburger.setAttribute('aria-expanded', isOpen);
            hamburger.innerHTML = isOpen
                ? '<i class="fa-solid fa-xmark"></i>'
                : '<i class="fa-solid fa-bars"></i>';
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!hamburger.contains(e.target) && !menu.contains(e.target)) {
                menu.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
                hamburger.innerHTML = '<i class="fa-solid fa-bars"></i>';
            }
        });

        // Close menu when a link is clicked
        menu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                menu.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
                hamburger.innerHTML = '<i class="fa-solid fa-bars"></i>';
            });
        });
    }

    tooltipTriggers.forEach(function(trigger) {
        if (window.bootstrap && bootstrap.Tooltip) {
            new bootstrap.Tooltip(trigger);
        }
    });

    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('date');
    if (dateInput) dateInput.value = today;

    invoices = getFromLocalStorage() || [];
    if (invoices.length > 0) {
        nextId = Math.max(...invoices.map(inv => inv.id)) + 1;
    }

    applySettingsToForms();

    const form = document.getElementById('invoiceForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            addInvoice();
        });
    }

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', function(e) {
            e.preventDefault();
            addInvoice();
        });
    }

    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveSettings();
        });
    }

    // Settings page buttons
    const saveBtn = document.getElementById('saveSettingsBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveSettings);

    const resetBtn = document.getElementById('resetSettingsBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetSettings);

    // Live tax preview on input change
    ['gpmPercent', 'expenseDeductionPercent', 'vsdPercent', 'psdPercent'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateTaxPreview);
    });

    // Country/Region Selection Handler
    const countrySelect = document.getElementById('countrySelect');
    if (countrySelect) {
        countrySelect.addEventListener('change', function() {
            handleCountryChange(this.value);
        });
        
        // Load saved country selection
        const savedCountry = localStorage.getItem('selectedCountry') || 'LT';
        countrySelect.value = savedCountry;
        handleCountryChange(savedCountry);
    }

    const archiveSearch = document.getElementById('searchInput');
    if (archiveSearch) {
        archiveSearch.addEventListener('input', () => {
            applyFilters();
        });
    }

    const dateFromInput = document.getElementById('dateFromInput');
    const dateToInput = document.getElementById('dateToInput');
    const statusFilter = document.getElementById('statusFilter');
    
    if (dateFromInput) {
        dateFromInput.addEventListener('change', applyFilters);
    }
    if (dateToInput) {
        dateToInput.addEventListener('change', applyFilters);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }

    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;

    function applyTheme(theme) {
        if (theme === 'dark') {
            html.setAttribute('data-theme', 'dark');
            if (themeToggle) themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            html.removeAttribute('data-theme');
            if (themeToggle) themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
        localStorage.setItem('theme', theme === 'dark' ? 'dark' : 'light');
    }
    
    const savedTheme = localStorage.getItem('theme');
    applyTheme(savedTheme === 'dark' ? 'dark' : 'light');
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = html.getAttribute('data-theme');
            if (currentTheme === 'dark') {
                applyTheme('light');
            } else {
                applyTheme('dark');
            }
            refreshDashboard();
            updateChart(invoices);
        });
    }

    updateNavActive();
    refreshDashboard();
});

function handleCountryChange(country) {
    localStorage.setItem('selectedCountry', country);
    
    const lithuaniaFields = document.getElementById('lithuaniaFields');
    const customFields = document.getElementById('customFields');
    
    if (country === 'LT') {
        // Show Lithuania-specific fields
        if (lithuaniaFields) {
            lithuaniaFields.style.display = 'grid';
            // Make sure to also set the form-control styling
            lithuaniaFields.classList.add('row', 'g-4');
        }
        if (customFields) customFields.style.display = 'none';
        
        // Set Lithuania default values
        const gpmField = document.getElementById('gpmPercent');
        const expenseField = document.getElementById('expenseDeductionPercent');
        const vsdField = document.getElementById('vsdPercent');
        const psdField = document.getElementById('psdPercent');
        
        if (gpmField) gpmField.value = 15;
        if (expenseField) expenseField.value = 30;
        if (vsdField) vsdField.value = 9;
        if (psdField) psdField.value = 6.98;
        
        showToast('✅ Pasirinkota: Lietuva (LT) - Standartiniai mokesčiai pasidengiau', 'success');
    } else if (country === 'CUSTOM') {
        // Show custom tax fields
        if (lithuaniaFields) lithuaniaFields.style.display = 'none';
        if (customFields) {
            customFields.style.display = 'grid';
            customFields.classList.add('row', 'g-4');
        }
        
        // Set default custom values
        const customTaxField = document.getElementById('customTaxPercent');
        const customExpenseField = document.getElementById('customExpensePercent');
        
        if (customTaxField) customTaxField.value = 0;
        if (customExpenseField) customExpenseField.value = 0;
        
        showToast('✅ Pasirinkota: Custom / Global - Galite rankiniu būdu nustatyti mokesčius', 'success');
    }
}

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
    const currentSettings = loadSettings();

    const amount = Number(invoice.amount || 0);

    const expenseDeductionPercent =
        Number(invoice.expense_deduction_percent)
        || Number(currentSettings.expenseDeductionPercent)
        || DEFAULT_SETTINGS.expenseDeductionPercent;

    const vsdPercent =
        Number(invoice.vsd_percent)
        || Number(currentSettings.vsdPercent)
        || DEFAULT_SETTINGS.vsdPercent;

    const psdPercent =
        Number(invoice.psd_percent)
        || Number(currentSettings.psdPercent)
        || DEFAULT_SETTINGS.psdPercent;

    const gpmPercent =
        Number(invoice.gpm_percent)
        || Number(currentSettings.gpmPercent)
        || DEFAULT_SETTINGS.gpmPercent;

    const expenseDeduction =
        amount * (expenseDeductionPercent / 100);

    const taxBase = amount - expenseDeduction;

    const gpm =
        taxBase * (gpmPercent / 100);

    const vsdPsdBase = taxBase * 0.9;

    const vsd =
        vsdPsdBase * (vsdPercent / 100);

    const psd =
        vsdPsdBase * (psdPercent / 100);

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
        client: invoice.client || invoice.client_name || '',
        client_name: invoice.client_name || invoice.client || '',
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

function getSettingsFromLocalStorage() {
    try {
        const data = localStorage.getItem(SETTINGS_KEY);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.warn('Settings read failed:', e);
        return null;
    }
}

function saveSettingsToLocalStorage(settingsObject) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsObject));
    } catch (e) {
        console.warn('Settings save failed:', e);
    }
}

function loadSettings() {
    const stored = getSettingsFromLocalStorage();
    return {
        ...DEFAULT_SETTINGS,
        ...(stored || {})
    };
}

function applySettingsToForms() {
    settings = loadSettings();
    const gpmField = document.getElementById('gpmPercent');
    const expenseField = document.getElementById('expenseDeductionPercent');
    const vsdField = document.getElementById('vsdPercent');
    const psdField = document.getElementById('psdPercent');
    // Also update old field name used in invoice modal
    const expenseDeductionField = document.getElementById('expenseDeduction');

    if (gpmField) gpmField.value = settings.gpmPercent;
    if (expenseField) expenseField.value = settings.expenseDeductionPercent;
    if (vsdField) vsdField.value = settings.vsdPercent;
    if (psdField) psdField.value = settings.psdPercent;
    if (expenseDeductionField) expenseDeductionField.value = settings.expenseDeductionPercent;

    updateTaxPreview();
    loadProfileSettings();
}

function updateTaxPreview() {
    const gpm = parseFloat(document.getElementById('gpmPercent')?.value) || DEFAULT_SETTINGS.gpmPercent;
    const expense = parseFloat(document.getElementById('expenseDeductionPercent')?.value) || DEFAULT_SETTINGS.expenseDeductionPercent;
    const vsd = parseFloat(document.getElementById('vsdPercent')?.value) || DEFAULT_SETTINGS.vsdPercent;
    const psd = parseFloat(document.getElementById('psdPercent')?.value) || DEFAULT_SETTINGS.psdPercent;

    const amount = 1000;
    const expenseDeduction = amount * (expense / 100);
    const taxBase = amount - expenseDeduction;
    const gpmAmt = taxBase * (gpm / 100);
    const vsdPsdBase = taxBase * 0.9;
    const vsdAmt = vsdPsdBase * (vsd / 100);
    const psdAmt = vsdPsdBase * (psd / 100);
    const netIncome = amount - gpmAmt - vsdAmt - psdAmt;

    const previewGPM = document.getElementById('previewGPM');
    const previewVSD = document.getElementById('previewVSD');
    const previewPSD = document.getElementById('previewPSD');
    const previewNet = document.getElementById('previewNet');

    if (previewGPM) previewGPM.textContent = `€${gpmAmt.toFixed(2)}`;
    if (previewVSD) previewVSD.textContent = `€${vsdAmt.toFixed(2)}`;
    if (previewPSD) previewPSD.textContent = `€${psdAmt.toFixed(2)}`;
    if (previewNet) previewNet.textContent = `€${netIncome.toFixed(2)}`;
}

function loadProfileSettings() {
    try {
        const profile = JSON.parse(localStorage.getItem('freelance_profile') || '{}');
        const req = JSON.parse(localStorage.getItem('freelance_requisites') || '{}');

        if (document.getElementById('profileFirstName')) document.getElementById('profileFirstName').value = profile.firstName || '';
        if (document.getElementById('profileLastName')) document.getElementById('profileLastName').value = profile.lastName || '';
        if (document.getElementById('profileEmail')) document.getElementById('profileEmail').value = profile.email || '';
        if (document.getElementById('profileIVNumber')) document.getElementById('profileIVNumber').value = profile.ivNumber || '';

        if (document.getElementById('reqIBAN')) document.getElementById('reqIBAN').value = req.iban || '';
        if (document.getElementById('reqBank')) document.getElementById('reqBank').value = req.bank || '';
        if (document.getElementById('reqCurrency')) document.getElementById('reqCurrency').value = req.currency || 'EUR';
        if (document.getElementById('reqVAT')) document.getElementById('reqVAT').value = req.vat || '';
    } catch(e) {}
}

function saveSettings() {
    const gpmPercent = parseFloat(document.getElementById('gpmPercent')?.value);
    const expenseDeductionPercent = parseFloat(document.getElementById('expenseDeductionPercent')?.value);
    const vsdPercent = parseFloat(document.getElementById('vsdPercent')?.value);
    const psdPercent = parseFloat(document.getElementById('psdPercent')?.value);

    // Validate
    if ([gpmPercent, expenseDeductionPercent, vsdPercent, psdPercent].some(v => isNaN(v) || v < 0 || v > 100)) {
        showToast('⚠️ Patikrinkite mokesčių procentus (0–100)', 'warning');
        return;
    }

    const newSettings = { gpmPercent, expenseDeductionPercent, vsdPercent, psdPercent };
    saveSettingsToLocalStorage(newSettings);
    settings = newSettings;

    // Save to API (DB)
    fetch('/api/tax-settings/LT', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            gpm_percent: gpmPercent,
            expense_deduction_percent: expenseDeductionPercent,
            vsd_percent: vsdPercent,
            psd_percent: psdPercent,
            is_custom: 1
        })
    }).catch(err => console.warn('API settings save failed:', err));

    // Save profile & requisites to localStorage
    const profile = {
        firstName: document.getElementById('profileFirstName')?.value || '',
        lastName: document.getElementById('profileLastName')?.value || '',
        email: document.getElementById('profileEmail')?.value || '',
        ivNumber: document.getElementById('profileIVNumber')?.value || ''
    };
    const req = {
        iban: document.getElementById('reqIBAN')?.value || '',
        bank: document.getElementById('reqBank')?.value || '',
        currency: document.getElementById('reqCurrency')?.value || 'EUR',
        vat: document.getElementById('reqVAT')?.value || ''
    };
    localStorage.setItem('freelance_profile', JSON.stringify(profile));
    localStorage.setItem('freelance_requisites', JSON.stringify(req));

    updateTaxPreview();
    showToast('✅ Nustatymai sėkmingai išsaugoti', 'success');
}

function resetSettings() {
    if (!confirm('Ar tikrai norite grąžinti numatytuosius nustatymus?')) return;
    saveSettingsToLocalStorage(DEFAULT_SETTINGS);
    settings = { ...DEFAULT_SETTINGS };
    applySettingsToForms();
    showToast('↩️ Grąžinti numatytieji nustatymai', 'success');
}

function updateNavActive() {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('.topbar-link').forEach(link => {
        const href = link.getAttribute('href')?.replace(/\/$/, '') || '/';
        if (href === path) {
            link.classList.add('active');
        } else if (href === '/' && (path === '' || path === '/')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function updateStatistics(invoices) {
    const statsContainer = document.getElementById('statsContainer');
    if (!statsContainer || !invoices.length) {
        if (statsContainer) statsContainer.style.display = 'none';
        return;
    }

    statsContainer.style.display = 'grid';

    let totalAmount = 0;
    let totalTax = 0;
    let totalNet = 0;

    invoices.forEach(invoice => {
        totalAmount += invoice.amount;
        totalTax += invoice.calculated_tax;
        totalNet += invoice.calculated_net_income;
    });

    const totalAmountEl = document.getElementById('totalAmount');
    const totalTaxEl = document.getElementById('totalTax');
    const totalNetEl = document.getElementById('totalNet');
    const totalCountEl = document.getElementById('totalCount');
    if (totalAmountEl) totalAmountEl.textContent = '€ ' + totalAmount.toFixed(2);
    if (totalTaxEl) totalTaxEl.textContent = '€ ' + totalTax.toFixed(2);
    if (totalNetEl) totalNetEl.textContent = '€ ' + totalNet.toFixed(2);
    if (totalCountEl) totalCountEl.textContent = invoices.length;
}

function updateSummary(invoices) {
    const summaryCard = document.getElementById('summaryCard');
    if (!summaryCard) return;

    if (!invoices.length) {
        summaryCard.style.display = 'none';
        return;
    }

    summaryCard.style.display = 'block';

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

    const summaryGPMEl = document.getElementById('summaryGPM');
    const summaryGPMPercentEl = document.getElementById('summaryGPMPercent');
    const summaryVSDEl = document.getElementById('summaryVSD');
    const summaryPSDEl = document.getElementById('summaryPSD');

    if (summaryGPMEl) summaryGPMEl.textContent = '€ ' + totalGPM.toFixed(2);
    if (summaryGPMPercentEl) summaryGPMPercentEl.textContent = avgGPMPercent.toFixed(2) + ' %';
    if (summaryVSDEl) summaryVSDEl.textContent = '€ ' + totalVSD.toFixed(2);
    if (summaryPSDEl) summaryPSDEl.textContent = '€ ' + totalPSD.toFixed(2);
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
        ['Klientas:', invoice.client],
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
        [`GPM (${(invoice.gpm_percent ?? settings.gpmPercent ?? DEFAULT_SETTINGS.gpmPercent).toFixed(2)}%):`, `€ ${invoice.calculated_gpm.toFixed(2)}`],
        ['VSD:', `€ ${invoice.calculated_vsd.toFixed(2)}`],
        ['PSD:', `€ ${invoice.calculated_psd.toFixed(2)}`]
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

function filterInvoices(searchValue) {
    if (!searchValue) return invoices;
    const query = searchValue.trim().toLowerCase();
    return invoices.filter(invoice => invoice.client.toLowerCase().includes(query));
}

function applyFilters() {
    const searchValue = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    const dateFrom = document.getElementById('dateFromInput')?.value || '';
    const dateTo = document.getElementById('dateToInput')?.value || '';
    const status = document.getElementById('statusFilter')?.value || '';

    const filtered = invoices.filter(invoice => {
        // Search filter
        if (searchValue && !invoice.client.toLowerCase().includes(searchValue)) {
            return false;
        }

        // Date range filter
        if (dateFrom && invoice.date < dateFrom) {
            return false;
        }
        if (dateTo && invoice.date > dateTo) {
            return false;
        }

        // Status filter
        if (status && (invoice.status || 'pending') !== status) {
            return false;
        }

        return true;
    });

    renderInvoiceTable(filtered);
}

function renderRecentInvoicesTable(data = null) {
    // Show only current month invoices on dashboard
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const invoicesToShow = data ? data : invoices;
    const recentInvoices = invoicesToShow
        .filter(inv => inv.date && inv.date.startsWith(currentYearMonth))
        .slice(-3).reverse();
    
    const tbody = document.querySelector('#recentTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    if (!recentInvoices.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Nėra sąskaitų</td></tr>';
        return;
    }

    recentInvoices.forEach(invoice => {
        const status = invoice.status || 'pending';
        const statusBadge = status === 'paid' 
            ? '<span class="badge bg-success">Apmokėta</span>' 
            : '<span class="badge bg-warning">Laukia</span>';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${invoice.client}</td>
            <td>€ ${invoice.amount.toFixed(2)}</td>
            <td>${new Date(invoice.date).toLocaleDateString('lt-LT')}</td>
            <td>${statusBadge}</td>
            <td class="text-end">
                <button class="btn btn-link text-danger p-1 delete-btn-recent" data-id="${invoice.id}" title="Ištrinti">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Setup action buttons for recent table
    document.querySelectorAll('.delete-btn-recent').forEach(button => {
        button.addEventListener('click', function() {
            deleteInvoice(this.dataset.id);
        });
    });
}

function renderInvoiceTable(data) {
    const tbody = document.querySelector('#invoiceTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Nėra sąskaitų</td></tr>';
        return;
    }

    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';

    data.forEach(invoice => {
        const status = invoice.status || 'pending';
        const statusBadge = status === 'paid' 
            ? '<span class="badge bg-success">Apmokėta</span>' 
            : '<span class="badge bg-warning text-dark">Laukia</span>';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>#${invoice.id}</td>
            <td>${invoice.client}</td>
            <td>€ ${invoice.amount.toFixed(2)}</td>
            <td>${new Date(invoice.date).toLocaleDateString('lt-LT')}</td>
            <td>€ ${invoice.calculated_tax.toFixed(2)}</td>
            <td>€ ${invoice.calculated_net_income.toFixed(2)}</td>
            <td>${statusBadge}</td>
            <td class="text-center"><button class="btn btn-link text-danger p-1 delete-btn" data-id="${invoice.id}" title="Ištrinti" ><i class="fa-regular fa-trash-can"></i> </button></td>
            <td class="text-center"><button class="btn btn-link text-primary p-1 download-pdf-btn" data-invoice="${encodeURIComponent(JSON.stringify(invoice))}" title="Atsisiųsti PDF" ><i class="fa-regular fa-file-pdf"></i></button></td>
        `;

        if (isDarkTheme) {
            row.querySelectorAll('td').forEach(td => {
                td.style.setProperty('background-color', '#1e293b', 'important');
                td.style.setProperty('color', '#f8fafc', 'important');
            });
        }

        tbody.appendChild(row);
    });

    setupActionButtons();
}

function setupActionButtons() {
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', function() {
            deleteInvoice(this.dataset.id);
        });
    });

    document.querySelectorAll('.download-pdf-btn').forEach(button => {
        button.addEventListener('click', function() {
            const invoice = JSON.parse(decodeURIComponent(this.getAttribute('data-invoice')));
            downloadPDF(invoice);
        });
    });
}

function refreshDashboard() {
    invoices = invoices.map(normalizeInvoice);
    saveToLocalStorage(invoices);

    const searchValue = document.getElementById('searchInput')?.value || '';
    
    // Dashboard page vs Archive page handling
    const invoiceTable = document.getElementById('invoiceTable');
    const recentTable = document.getElementById('recentTable');
    
    if (recentTable) {
        // Dashboard page - show only recent 3
        renderRecentInvoicesTable();
        // Update dashboard cards with current month data
        updateDashboardCards(invoices);
    } else if (invoiceTable) {
        // Archive page - show all with search
        const rows = searchValue ? filterInvoices(searchValue) : invoices;
        renderInvoiceTable(rows);
    }

    updateStatistics(invoices);
    updateSummary(invoices);
    updateChart(invoices);
    setupTooltips();
}

function updateDashboardCards(allInvoices) {
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const monthInvoices = allInvoices.filter(inv => {
        return inv.date && inv.date.startsWith(currentYearMonth);
    });

    let totalAmount = 0;
    let totalTax = 0;
    let totalNet = 0;

    monthInvoices.forEach(invoice => {
        totalAmount += Number(invoice.amount || 0);
        totalTax += Number(invoice.calculated_tax || 0);
        totalNet += Number(invoice.calculated_net_income || 0);
    });

    const totalAmountEl = document.getElementById('totalAmount');
    const totalTaxEl = document.getElementById('totalTax');
    const totalNetEl = document.getElementById('totalNet');
    const totalCountEl = document.getElementById('totalCount');

    if (totalAmountEl) totalAmountEl.textContent = `€ ${totalAmount.toFixed(2)}`;
    if (totalTaxEl) totalTaxEl.textContent = `€ ${totalTax.toFixed(2)}`;
    if (totalNetEl) totalNetEl.textContent = `€ ${totalNet.toFixed(2)}`;
    if (totalCountEl) totalCountEl.textContent = monthInvoices.length;
}

function addInvoice() {
    const client = document.getElementById('client')?.value.trim();
    const amount = document.getElementById('amount')?.value;
    const date = document.getElementById('date')?.value;

    const currentSettings = loadSettings();
    const expenseDeduction = parseFloat(document.getElementById('expenseDeduction')?.value || currentSettings.expenseDeductionPercent) || currentSettings.expenseDeductionPercent;
    const vsdPercent = parseFloat(document.getElementById('vsdPercent')?.value || currentSettings.vsdPercent) || currentSettings.vsdPercent;
    const psdPercent = parseFloat(document.getElementById('psdPercent')?.value || currentSettings.psdPercent) || currentSettings.psdPercent;
    const gpmPercent = currentSettings.gpmPercent;

    if (!client) {
        showToast('Prašau įvesti kliento pavadinimą', 'warning');
        document.getElementById('client')?.focus();
        return;
    }

    if (!amount || amount <= 0) {
        showToast('Prašau įvesti teisingą sumą', 'warning');
        document.getElementById('amount')?.focus();
        return;
    }

    if (!date) {
        showToast('Prašau pasirinkti datą', 'warning');
        document.getElementById('date')?.focus();
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('loading-btn');
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pridedama...';
    }

    fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_name: client,
            amount: parseFloat(amount),
            date: date,
            expense_deduction_percent: expenseDeduction,
            vsd_percent: vsdPercent,
            psd_percent: psdPercent,
            status: document.getElementById('status')?.value || 'pending'
        })
    })
    .then(res => res.json())
    .then(() => {
        document.getElementById('invoiceForm')?.reset();
        const today = new Date().toISOString().split('T')[0];
        if (document.getElementById('date')) document.getElementById('date').value = today;

        showToast('✨ Sąskaita sėkmingai pridėta!', 'success');

        // Close modal
        const modalEl = document.getElementById('addInvoiceModal') || document.getElementById('invoiceModal');
        if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }

        loadInvoices();
    })
    .catch(err => {
        console.error('Failed to save invoice:', err);
        showToast('❌ Klaida išsaugant sąskaitą', 'error');
    })
    .finally(() => {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading-btn');
            submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Pridėti sąskaitą';
        }
    });
}

function deleteInvoice(invoiceId) {
    if (!confirm('Ar Jūs tikras, kad norite ištrinti šią sąskaitą?')) {
        return;
    }

    fetch(`/api/invoices/${invoiceId}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(() => {
            showToast('🗑️ Sąskaita sėkmingai ištrinta!', 'success');
            loadInvoices();
        })
        .catch(err => {
            console.error('Failed to delete invoice:', err);
            showToast('❌ Klaida trinant sąskaitą', 'error');
        });
}

function calculateChartMax(values = []) {
    const maxValue = Math.max(...values, 0);

    if (maxValue <= 0) return 100;

    return Math.ceil(maxValue * 1.2);
}

function updateChart(invoices) {
    const ctx = document.getElementById('incomeChart');
    const miniCtx = document.getElementById('miniChart');
    const pieCanvas = document.getElementById('ratioPieChart') || document.getElementById('taxDonutChart');
    const style = getComputedStyle(document.documentElement);
    const textColor = style.getPropertyValue('--chart-text').trim() || '#000000';
    const gridColor = style.getPropertyValue('--chart-grid').trim() || 'rgba(0,0,0,0.1)';

    // Prepare monthly data
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

    const netoTotals = sortedKeys.map(key => Number(monthlyData[key].neto.toFixed(2)));
    const taxTotals = sortedKeys.map(key => Number(monthlyData[key].taxes.toFixed(2)));
    const incomeChartMax = calculateChartMax([
        ...netoTotals.map((v, i) => v + taxTotals[i]),
        ...taxTotals.map(v => v),
        ...netoTotals.map(v => v)
    ]);

    // Mini chart - only current month data
    if (miniCtx) {
        const currentDate = new Date();
        const currentKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        const currentMonthData = monthlyData[currentKey];
        
        const miniLabels = currentMonthData ? [labels[sortedKeys.indexOf(currentKey)] || 'Šis mėnuo'] : ['Nėra duomenų'];
        const miniNetoData = currentMonthData ? [currentMonthData.neto] : [0];
        const miniTaxData = currentMonthData ? [currentMonthData.taxes] : [0];

        if (miniChart) {
            miniChart.destroy();
        }

        miniChart = new Chart(miniCtx, {
            type: 'bar',
            data: {
                labels: miniLabels,
                datasets: [{
                    label: 'Likutis į rankas (€)',
                    data: miniNetoData,
                    backgroundColor: 'rgba(34, 197, 94, 0.85)',
                    borderColor: 'rgba(34, 197, 94, 1)',
                    borderWidth: 2,
                    borderRadius: 8,
                    maxBarThickness: 60,
                }, {
                    label: 'Mokesčiai (€)',
                    data: miniTaxData,
                    backgroundColor: 'rgba(239, 68, 68, 0.85)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 2,
                    borderRadius: 8,
                    maxBarThickness: 60,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { weight: '600' } }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { weight: '600' } }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: textColor, font: { weight: '600' }, usePointStyle: true }
                    },
                    tooltip: {
                        backgroundColor: style.getPropertyValue('--surface').trim(),
                        titleColor: textColor,
                        bodyColor: style.getPropertyValue('--muted').trim()
                    }
                }
            }
        });
    }

    if (ctx) {
        if (!labels.length) {
            labels.push('Nėra duomenų');
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
                    borderRadius: 12,
                    stack: 'Stack 0',
                    maxBarThickness: 50,
                }, {
                    label: 'Mokesčiai (€)',
                    data: taxTotals,
                    backgroundColor: 'rgba(239, 68, 68, 0.85)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 2,
                    borderRadius: 12,
                    stack: 'Stack 0',
                    maxBarThickness: 50,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: textColor,
                            font: { weight: '600' }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        stacked: true,
                        max: incomeChartMax,
                        grid: {
                            color: gridColor,
                            drawBorder: false
                        },
                        ticks: {
                            color: textColor,
                            font: { weight: '600' },
                            padding: 10,
                            callback: value => `€ ${value}`
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: textColor,
                            font: { weight: '600' },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: style.getPropertyValue('--surface').trim(),
                        titleColor: textColor,
                        bodyColor: style.getPropertyValue('--muted').trim()
                    }
                }
            }
        });
    }

    if (pieCanvas) {
        const totalTax = invoices.reduce((sum, invoice) => sum + invoice.calculated_tax, 0);
        const totalNet = invoices.reduce((sum, invoice) => sum + invoice.calculated_net_income, 0);
        const pieValues = totalTax || totalNet ? [totalTax, totalNet] : [1, 1];

        if (ratioChart) {
            ratioChart.destroy();
        }

        ratioChart = new Chart(pieCanvas, {
            type: 'doughnut',
            data: {
                labels: ['Mokesčiai', 'Grynasis pelnas'],
                datasets: [{
                    data: pieValues,
                    backgroundColor: ['rgba(239, 68, 68, 0.85)', 'rgba(34, 197, 94, 0.85)'],
                    borderColor: ['rgba(239, 68, 68, 1)', 'rgba(34, 197, 94, 1)'],
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            font: { weight: '600' },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: style.getPropertyValue('--surface').trim(),
                        titleColor: textColor,
                        bodyColor: style.getPropertyValue('--muted').trim(),
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw;
                                const total = pieValues.reduce((sum, current) => sum + current, 0);
                                const percentage = total ? (value / total) * 100 : 0;
                                return `${label}: € ${value.toFixed(2)} (${percentage.toFixed(1)}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Yearly trend chart
    const yearlyCtx = document.getElementById('yearlyTrendChart');
    if (yearlyCtx) {
        const yearlyData = invoices.reduce((acc, invoice) => {
            const year = invoice.date.split('-')[0];
            if (!year) return acc;
            if (!acc[year]) acc[year] = { bruto: 0, neto: 0, taxes: 0 };
            acc[year].bruto += invoice.amount;
            acc[year].neto += invoice.calculated_net_income;
            acc[year].taxes += invoice.calculated_tax;
            return acc;
        }, {});

        const yearlyKeys = Object.keys(yearlyData).sort();
        const yearlyLabels = yearlyKeys;
        const yearlyNetoTotals = yearlyKeys.map(key => Number(yearlyData[key].neto.toFixed(2)));
        const yearlyTaxTotals = yearlyKeys.map(key => Number(yearlyData[key].taxes.toFixed(2)));
        const yearlyChartMax = calculateChartMax([
            ...yearlyNetoTotals,
            ...yearlyTaxTotals
        ]);

        if (yearlyChart) {
            yearlyChart.destroy();
        }

        yearlyChart = new Chart(yearlyCtx, {
            type: 'line',
            data: {
                labels: yearlyLabels.length ? yearlyLabels : ['Nėra duomenų'],
                datasets: [{
                    label: 'Likutis į rankas (€)',
                    data: yearlyNetoTotals,
                    borderColor: 'rgba(34, 197, 94, 1)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 6,
                    pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                }, {
                    label: 'Mokesčiai (€)',
                    data: yearlyTaxTotals,
                    borderColor: 'rgba(239, 68, 68, 1)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 6,
                    pointBackgroundColor: 'rgba(239, 68, 68, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { weight: '600' } }
                    },
                    y: {
                        beginAtZero: true,
                        max: yearlyChartMax,
                        grid: {
                            color: gridColor,
                            drawBorder: false
                        },
                        ticks: {
                            color: textColor,
                            font: { weight: '600' },
                            padding: 10,
                            callback: value => `€ ${value}`
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: textColor, font: { weight: '600' }, usePointStyle: true }
                    },
                    tooltip: {
                        backgroundColor: style.getPropertyValue('--surface').trim(),
                        titleColor: textColor,
                        bodyColor: style.getPropertyValue('--muted').trim()
                    }
                }
            }
        });
    }

    // Yearly income curve chart (analytics page)
    const yearlyIncomeCurveCtx = document.getElementById('yearlyIncomeCurve');
    if (yearlyIncomeCurveCtx) {
        // Monthly net income line chart
        const monthlyKeys = Object.keys(monthlyData).sort();
        const monthlyLabels = monthlyKeys.map(key => {
            const [year, month] = key.split('-');
            const monthNames = ['Sau', 'Vas', 'Kov', 'Bal', 'Geg', 'Bir', 'Lie', 'Rug', 'Rgs', 'Spa', 'Lap', 'Grd'];
            return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
        });
        const monthlyNeto = monthlyKeys.map(k => Number(monthlyData[k].neto.toFixed(2)));

        if (window._yearlyIncomeCurveChart) window._yearlyIncomeCurveChart.destroy();

        window._yearlyIncomeCurveChart = new Chart(yearlyIncomeCurveCtx, {
            type: 'line',
            data: {
                labels: monthlyLabels.length ? monthlyLabels : ['Nėra duomenų'],
                datasets: [{
                    label: 'Likutis į rankas (€)',
                    data: monthlyNeto.length ? monthlyNeto : [0],
                    borderColor: 'rgba(34, 197, 94, 1)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 5,
                    pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false }, ticks: { color: textColor, font: { weight: '600' } } },
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { weight: '600' }, callback: v => `€ ${v}` }
                    }
                },
                plugins: {
                    legend: { labels: { color: textColor, font: { weight: '600' }, usePointStyle: true } },
                    tooltip: {
                        backgroundColor: style.getPropertyValue('--surface').trim(),
                        titleColor: textColor,
                        bodyColor: style.getPropertyValue('--muted').trim()
                    }
                }
            }
        });
    }

    // Income change % indicator (analytics page)
    const changeEl = document.getElementById('incomeChangePercent');
    if (changeEl) {
        const monthlyKeys = Object.keys(monthlyData).sort();
        if (monthlyKeys.length >= 2) {
            const prev = monthlyData[monthlyKeys[monthlyKeys.length - 2]].neto;
            const curr = monthlyData[monthlyKeys[monthlyKeys.length - 1]].neto;
            const pct = prev > 0 ? ((curr - prev) / prev * 100) : 0;
            const sign = pct >= 0 ? '+' : '';
            changeEl.textContent = `${sign}${pct.toFixed(1)}%`;
            changeEl.className = pct >= 0 ? 'display-4 fw-bold text-success' : 'display-4 fw-bold text-danger';
        } else if (monthlyKeys.length === 1) {
            changeEl.textContent = 'N/A';
            changeEl.className = 'display-4 fw-bold text-muted';
        }
    }
}

window.addEventListener('scroll', () => {
    const topbar = document.querySelector('.topbar');

    if (window.scrollY > 50) {
        topbar.classList.add('shrink');
    } else {
        topbar.classList.remove('shrink');
    }
});

async function loadInvoices() {
    try {
        const response = await fetch('/api/invoices');

        const data = await response.json();

        // IMPORTANT
        invoices = data.map(normalizeInvoice);

        saveToLocalStorage(invoices);

        // IMPORTANT - refreshDashboard handles card updates with current month filter
        refreshDashboard();

    } catch (error) {
        console.error('Failed to load invoices:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadInvoices();
    refreshDashboard();
});