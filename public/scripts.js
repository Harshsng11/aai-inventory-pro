document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');

  // Redirect to login if not authenticated (except on index.html)
  if (!token && !location.pathname.includes('index.html')) {
    window.location.href = 'index.html';
  }

  // LOGIN PAGE
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem('token', data.token);
          window.location.href = 'dashboard.html';
        } else {
          document.getElementById('login-error').textContent = data.error || 'Invalid credentials';
        }
      } catch (err) {
        document.getElementById('login-error').textContent = 'Server error. Try again.';
        console.error('Login error:', err);
      }
    });
  }

  // DASHBOARD PAGE
  if (location.pathname.includes('dashboard.html')) {
    loadInventory();

    document.getElementById('add-item-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      addItem();
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => {
      logout();
    });
  }

  // ANALYSIS PAGE
  if (location.pathname.includes('analysis.html')) {
    fetch('/api/inventory/analytics', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(res => res.json())
      .then(data => {
        const ctx = document.getElementById('lowStockChart').getContext('2d');
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: data.lowStock.map(i => i.name),
            datasets: [{
              label: 'Quantity',
              data: data.lowStock.map(i => i.quantity),
              backgroundColor: 'rgba(255, 99, 132, 0.7)',
            }],
          },
        });
      });
  }
});

// 🔧 UTILITY FUNCTIONS

function loadInventory() {
  fetch('/api/inventory', {
    headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
  })
    .then(res => res.json())
    .then(data => {
      const tbody = document.querySelector('#inventory-table tbody');
      tbody.innerHTML = '';
      data.items.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${item.id}</td>
          <td>${item.name}</td>
          <td>${item.quantity}</td>
          <td>${item.price}</td>
          <td><button class="delete-btn" data-id="${item.id}">Delete</button></td>
        `;
        tbody.appendChild(row);
      });

      // Attach delete handlers
      document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          deleteItem(btn.dataset.id);
        });
      });
    });
}

function addItem() {
  const name = document.getElementById('name').value;
  const quantity = document.getElementById('quantity').value;
  const price = document.getElementById('price').value;

  fetch('/api/inventory', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + localStorage.getItem('token'),
    },
    body: JSON.stringify({ name, quantity, price }),
  })
    .then(res => {
      if (!res.ok) throw new Error('Failed to add');
      return res.json();
    })
    .then(() => {
      loadInventory();
      document.getElementById('add-item-form').reset();
    })
    .catch(err => {
      console.error('Add item error:', err);
      alert('Failed to add item');
    });
}

function deleteItem(id) {
  fetch(`/api/inventory/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: 'Bearer ' + localStorage.getItem('token'),
    },
  })
    .then(() => {
      loadInventory();
    })
    .catch(err => {
      console.error('Delete item error:', err);
      alert('Failed to delete item');
    });
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = 'index.html';
}
