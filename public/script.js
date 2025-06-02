const state = {
    token: null,
    role: null,
    currentPage: 1,
    itemsPerPage: 5,
    totalItems: 0,
    items: [],
    lowStockItems: [],
    lastUpdated: null
};

// Utility to show toast notifications
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toastIcon.className = type === 'success' ? 'fas fa-check-circle text-green-500' : 'fas fa-exclamation-circle text-red-500';
    toast.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-all duration-300 ${type === 'success' ? 'bg-green-100' : 'bg-red-100'} show`;
    setTimeout(() => {
        toast.className = 'fixed top-4 right-4 z-50 hidden p-4 rounded-lg shadow-lg transition-all duration-300';
    }, 3000);
}

// Show/hide loading spinner
function toggleLoading(show) {
    document.getElementById('loadingSpinner').className = show ? 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50' : 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 hidden';
}

// Toggle dark mode
function toggleDarkMode() {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
}

// Show specific section
function showSection(sectionId) {
    document.getElementById('inventorySection').classList.add('hidden');
    document.getElementById('analyticsSection').classList.add('hidden');
    document.getElementById(sectionId).classList.remove('hidden');
    if (sectionId === 'analyticsSection') fetchAnalytics();
}

// Login
async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    try {
        toggleLoading(true);
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        state.token = data.token;
        state.role = data.role;
        localStorage.setItem('token', state.token);
        localStorage.setItem('role', state.role);
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        if (state.role !== 'admin') {
            document.getElementById('itemForm').classList.add('hidden');
            document.getElementById('bulkUploadBtn').classList.add('hidden');
        }
        fetchInventory();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        toggleLoading(false);
    }
}

// Logout
function logout() {
    state.token = null;
    state.role = null;
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('loginModal').classList.remove('hidden');
}

// Fetch and display inventory
async function fetchInventory() {
    const searchTerm = document.getElementById('searchInput').value;
    const sort = document.getElementById('sortSelect').value;
    const order = document.getElementById('orderSelect').value;
    try {
        toggleLoading(true);
        const response = await fetch(`/api/inventory?page=${state.currentPage}&limit=${state.itemsPerPage}&sort=${sort}&order=${order}&search=${searchTerm}`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch inventory');
        const data = await response.json();
        state.items = data.items;
        state.totalItems = data.total;
        state.lastUpdated = new Date().toLocaleString();
        document.getElementById('totalItems').textContent = state.totalItems;
        document.getElementById('lastUpdated').textContent = state.lastUpdated;
        document.getElementById('lowStockItems').textContent = state.items.filter(item => item.quantity < 5).length;
        renderInventory();
        updatePagination();
    } catch (error) {
        showToast('Error fetching inventory', 'error');
    } finally {
        toggleLoading(false);
    }
}

// Render inventory table
function renderInventory() {
    const tbody = document.getElementById('inventoryBody');
    tbody.innerHTML = '';
    if (state.items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-gray-500 dark:text-gray-400">No items found</td></tr>`;
        return;
    }
    state.items.forEach(item => {
        const row = document.createElement('tr');
        row.className = item.quantity < 5 ? 'bg-red-100 dark:bg-red-900' : '';
        row.innerHTML = `
            <td class="p-3" data-label="ID">${item.id}</td>
            <td class="p-3" data-label="Name">${item.name}</td>
            <td class="p-3" data-label="Quantity">${item.quantity}</td>
            <td class="p-3" data-label="Price">$${item.price.toFixed(2)}</td>
            <td class="p-3" data-label="Actions">
                <button onclick="editItem(${item.id})" class="radar-button bg-yellow-600 text-white px-3 py-1 rounded-lg hover:bg-yellow-500 transition mr-2 ${state.role !== 'admin' ? 'hidden' : ''}">
                    Edit
                </button>
                <button onclick="deleteItem(${item.id})" class="radar-button bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-500 transition ${state.role !== 'admin' ? 'hidden' : ''}">
                    Delete
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Update pagination controls
function updatePagination() {
    const totalPages = Math.ceil(state.totalItems / state.itemsPerPage);
    document.getElementById('pageInfo').textContent = `Page ${state.currentPage} of ${totalPages}`;
    document.getElementById('prevPage').disabled = state.currentPage === 1;
    document.getElementById('nextPage').disabled = state.currentPage === totalPages || totalPages === 0;
    document.getElementById('goToPage').max = totalPages;
}

// Change page
function changePage(direction) {
    state.currentPage += direction;
    fetchInventory();
}

// Go to specific page
function goToPage() {
    const page = parseInt(document.getElementById('goToPage').value);
    const totalPages = Math.ceil(state.totalItems / state.itemsPerPage);
    if (isNaN(page) || page < 1 || page > totalPages) {
        showToast('Invalid page number', 'error');
        return;
    }
    state.currentPage = page;
    fetchInventory();
}

// Save or update item
async function saveItem() {
    const id = document.getElementById('itemId').value;
    const name = document.getElementById('name').value.trim();
    const quantity = document.getElementById('quantity').value;
    const price = document.getElementById('price').value;

    if (!name || !quantity || !price) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    const item = { name, quantity, price };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/inventory/${id}` : '/api/inventory';

    try {
        toggleLoading(true);
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify(item)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }
        showToast(id ? 'Item updated successfully' : 'Item added successfully', 'success');
        resetForm();
        fetchInventory();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        toggleLoading(false);
    }
}

// Edit item
function editItem(id) {
    const item = state.items.find(i => i.id === id);
    if (item) {
        document.getElementById('itemId').value = item.id;
        document.getElementById('name').value = item.name;
        document.getElementById('quantity').value = item.quantity;
        document.getElementById('price').value = item.price;
    }
}

// Delete item
async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
        toggleLoading(true);
        const response = await fetch(`/api/inventory/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }
        showToast('Item deleted successfully', 'success');
        fetchInventory();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        toggleLoading(false);
    }
}

// Open bulk upload modal
function openBulkUploadModal() {
    document.getElementById('bulkUploadModal').classList.remove('hidden');
}

// Close bulk upload modal
function closeBulkUploadModal() {
    document.getElementById('bulkUploadModal').classList.add('hidden');
    document.getElementById('bulkUploadForm').reset();
}

// Upload bulk items
async function uploadBulkItems() {
    const fileInput = document.getElementById('bulkUploadFile');
    const file = fileInput.files[0];
    if (!file) {
        showToast('Please select a CSV file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const lines = text.split('\n').slice(1); // Skip header
        const items = lines
            .map(line => {
                const [name, quantity, price] = line.split(',').map(item => item.trim());
                if (!name || !quantity || !price) return null;
                return { name, quantity, price };
            })
            .filter(item => item);

        try {
            toggleLoading(true);
            const response = await fetch('/api/inventory/bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.token}`
                },
                body: JSON.stringify(items)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            showToast(data.message, 'success');
            closeBulkUploadModal();
            fetchInventory();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            toggleLoading(false);
        }
    };
    reader.readAsText(file);
}

// Search items
function searchItems() {
    state.currentPage = 1;
    fetchInventory();
}

// Fetch and render analytics
async function fetchAnalytics() {
    try {
        toggleLoading(true);
        const response = await fetch('/api/inventory/analytics', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch analytics');
        const data = await response.json();
        state.lowStockItems = data.lowStock;
        document.getElementById('lowStockItems').textContent = state.lowStockItems.length;
        renderLowStock();
    } catch (error) {
        showToast('Error fetching analytics', 'error');
    } finally {
        toggleLoading(false);
    }
}

// Render low stock items
function renderLowStock() {
    const tbody = document.getElementById('lowStockBody');
    tbody.innerHTML = '';
    if (state.lowStockItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-gray-500 dark:text-gray-400">No low stock items</td></tr>`;
        return;
    }
    state.lowStockItems.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="p-3" data-label="ID">${item.id}</td>
            <td class="p-3" data-label="Name">${item.name}</td>
            <td class="p-3" data-label="Quantity">${item.quantity}</td>
            <td class="p-3" data-label="Price">$${item.price.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });
}

// Export to CSV
function exportToCSV() {
    const csv = ['ID,Name,Quantity,Price'];
    state.items.forEach(item => {
        csv.push(`${item.id},${item.name},${item.quantity},${item.price}`);
    });
    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aai_inventory.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}


function resetForm() {
    document.getElementById('itemForm').reset();
    document.getElementById('itemId').value = '';
}


document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark');
    }
    state.token = localStorage.getItem('token');
    state.role = localStorage.getItem('role');
    if (state.token) {
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        if (state.role !== 'admin') {
            document.getElementById('itemForm').classList.add('hidden');
            document.getElementById('bulkUploadBtn').classList.add('hidden');
        }
        fetchInventory();
    }
});