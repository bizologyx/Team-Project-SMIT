/**
 * BolSaathi Contacts Manager
 * Manages private browser-local contacts stored in localStorage.
 */

import { requireAuth, logoutUser } from './auth.js';

const STORAGE_KEY = 'bolsaathi.contacts.v1';
const $ = (id) => document.getElementById(id);

let contacts = loadContacts();
let activeFilter = 'all';
let currentUser = null;
let currentProfile = null;

/**
 * Route protection and user profile display initialization
 */
async function initAuth() {
  const authData = await requireAuth();
  if (!authData) return;

  currentUser = authData.user;
  currentProfile = authData.profile;

  const userBadge = $('userBadge');
  if (userBadge) {
    const roleText = currentProfile?.role ? currentProfile.role.toUpperCase() : 'USER';
    const nameText = currentProfile?.full_name || currentUser.email;
    userBadge.textContent = `${nameText} (${roleText})`;
  }
}

/**
 * Load contacts array from local storage
 */
function loadContacts() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Persist contacts array to local storage and update UI
 */
function persistContacts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
    render();
  } catch {
    showToast('Browser storage unavailable. Check device storage settings.');
  }
}

/**
 * Generate 2-letter initials from name
 */
function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase() || 'BS';
}

/**
 * Escape HTML special characters for safe output
 */
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

/**
 * Render contact cards and stats counters
 */
function render() {
  const query = $('search')?.value.trim().toLowerCase() || '';

  const filtered = contacts.filter((contact) => {
    const matchesFilter = activeFilter === 'all' || contact.kind === activeFilter;
    const matchesQuery = [
      contact.name,
      contact.company,
      contact.email,
      contact.phone,
      contact.notes,
      contact.language,
      contact.kind
    ].some((field) => (field || '').toLowerCase().includes(query));

    return matchesFilter && matchesQuery;
  });

  // Update counters
  if ($('totalCount')) $('totalCount').textContent = contacts.length;
  if ($('clientCount')) $('clientCount').textContent = contacts.filter((c) => c.kind === 'Client').length;
  if ($('urduCount')) $('urduCount').textContent = contacts.filter((c) => c.language === 'Urdu' || c.language === 'Both').length;
  if ($('navCount')) $('navCount').textContent = contacts.length;

  const grid = $('contactGrid');
  if (!grid) return;

  grid.replaceChildren();

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = contacts.length
      ? '<strong>No contacts match your search</strong>Try another name or change the filter.'
      : '<strong>Your contact book starts here.</strong>Add a client or collaborator and keep their preferred language and meeting context handy.';
    grid.append(empty);
    return;
  }

  filtered.forEach((c) => {
    const card = document.createElement('article');
    card.className = 'contact-card';
    card.innerHTML = `
      <div class="card-head">
        <div class="avatar">${escapeHtml(getInitials(c.name))}</div>
        <div class="name-wrap">
          <h2>${escapeHtml(c.name)}</h2>
          <p>${escapeHtml(c.company || c.kind)}</p>
        </div>
        <span class="lang-pill">${escapeHtml(c.language)}</span>
      </div>
      <div class="contact-details">
        ${c.email ? `<div class="detail"><span>✉</span><span>${escapeHtml(c.email)}</span></div>` : ''}
        ${c.phone ? `<div class="detail"><span>↗</span><span>${escapeHtml(c.phone)}</span></div>` : ''}
        <div class="detail"><span>◈</span><span>${escapeHtml(c.kind)}</span></div>
      </div>
      <div class="notes">${escapeHtml(c.notes || 'No conversation notes yet.')}</div>
      <div class="card-actions">
        <button class="btn" data-action="edit" data-id="${escapeHtml(c.id)}">Edit</button>
        <button class="btn" data-action="copy" data-id="${escapeHtml(c.id)}">Copy details</button>
        <button class="btn danger" data-action="delete" data-id="${escapeHtml(c.id)}">Delete</button>
      </div>
    `;
    grid.append(card);
  });
}

/**
 * Open Modal to Add or Edit a Contact
 */
function openModal(contact = null) {
  $('contactForm').reset();
  $('contactId').value = contact?.id || '';
  $('modalTitle').textContent = contact ? 'Edit contact' : 'Add a contact';
  $('name').value = contact?.name || '';
  $('company').value = contact?.company || '';
  $('email').value = contact?.email || '';
  $('phone').value = contact?.phone || '';
  $('kind').value = contact?.kind || 'Client';
  $('language').value = contact?.language || 'English';
  $('notes').value = contact?.notes || '';
  $('formError').textContent = '';
  $('modalBackdrop').classList.add('open');
  setTimeout(() => $('name').focus(), 30);
}

/**
 * Close Modal
 */
function closeModal() {
  $('modalBackdrop').classList.remove('open');
}

/**
 * Show temporary toast message
 */
function showToast(msg) {
  const toastEl = $('toast');
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove('show'), 2300);
}

/**
 * Escape string for CSV cell
 */
function csvCell(value) {
  return '"' + String(value ?? '').replace(/"/g, '""') + '"';
}

/**
 * Trigger file download
 */
function downloadFile(filename, text, mimeType) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// Event Listeners
$('addBtn')?.addEventListener('click', () => openModal());
$('closeModal')?.addEventListener('click', closeModal);
$('cancelModal')?.addEventListener('click', closeModal);
$('logoutBtn')?.addEventListener('click', () => logoutUser());

$('modalBackdrop')?.addEventListener('click', (e) => {
  if (e.target === $('modalBackdrop')) closeModal();
});

$('search')?.addEventListener('input', render);

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.classList.toggle('active', btn === button);
    });
    render();
  });
});

$('contactForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('name').value.trim();
  if (!name) {
    $('formError').textContent = 'Please enter a name.';
    return;
  }

  const id = $('contactId').value || crypto.randomUUID();
  const item = {
    id,
    name,
    company: $('company').value.trim(),
    email: $('email').value.trim(),
    phone: $('phone').value.trim(),
    kind: $('kind').value,
    language: $('language').value,
    notes: $('notes').value.trim(),
    updatedAt: new Date().toISOString()
  };

  const index = contacts.findIndex((c) => c.id === id);
  if (index >= 0) {
    contacts[index] = item;
  } else {
    contacts.unshift(item);
  }

  persistContacts();
  closeModal();
  showToast(index >= 0 ? 'Contact updated' : 'Contact saved on this device');
});

$('contactGrid')?.addEventListener('click', async (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;

  const contact = contacts.find((x) => x.id === button.dataset.id);
  if (!contact) return;

  if (button.dataset.action === 'edit') {
    openModal(contact);
  }

  if (button.dataset.action === 'delete') {
    if (confirm(`Delete ${contact.name} from this device?`)) {
      contacts = contacts.filter((x) => x.id !== contact.id);
      persistContacts();
      showToast('Contact deleted');
    }
  }

  if (button.dataset.action === 'copy') {
    const detailsText = [
      contact.name,
      contact.company,
      contact.email,
      contact.phone,
      `Relationship: ${contact.kind}`,
      `Preferred language: ${contact.language}`,
      `Notes: ${contact.notes}`
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(detailsText);
      showToast('Contact details copied');
    } catch {
      downloadFile('bolsaathi-contact.txt', detailsText, 'text/plain;charset=utf-8');
      showToast('Clipboard unavailable; downloaded details');
    }
  }
});

$('exportBtn')?.addEventListener('click', () => {
  if (!contacts.length) return showToast('Add a contact before exporting.');
  const cols = ['name', 'company', 'email', 'phone', 'kind', 'language', 'notes'];
  const csvContent = [
    cols.join(','),
    ...contacts.map((c) => cols.map((k) => csvCell(c[k])).join(','))
  ].join('\r\n');

  downloadFile('bolsaathi-contacts.csv', csvContent, 'text/csv;charset=utf-8');
  showToast('Contacts exported as CSV');
});

$('importBtn')?.addEventListener('click', () => $('csvFile')?.click());

$('csvFile')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const rows = text.split(/\r?\n/).filter(Boolean);
    if (rows.length < 2) throw new Error('CSV needs a header row and at least one contact.');

    const parseLine = (line) => {
      const result = [];
      let current = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && quoted && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          quoted = !quoted;
        } else if (char === ',' && !quoted) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current);
      return result;
    };

    const headers = parseLine(rows.shift()).map((h) => h.trim().toLowerCase());
    const imported = rows
      .map((row) => {
        const values = parseLine(row);
        const obj = {};
        headers.forEach((h, i) => (obj[h] = values[i] || ''));
        if (!obj.name?.trim()) return null;
        return {
          id: crypto.randomUUID(),
          name: obj.name.trim(),
          company: obj.company || '',
          email: obj.email || '',
          phone: obj.phone || '',
          kind: ['Client', 'Collaborator', 'Other'].includes(obj.kind) ? obj.kind : 'Other',
          language: ['English', 'Urdu', 'Both', 'Other'].includes(obj.language) ? obj.language : 'English',
          notes: obj.notes || '',
          updatedAt: new Date().toISOString()
        };
      })
      .filter(Boolean);

    if (!imported.length) throw new Error('No valid rows with a name were found.');

    const existingEmails = new Set(contacts.map((c) => (c.email || '').toLowerCase()).filter(Boolean));
    const newContacts = imported.filter((c) => !c.email || !existingEmails.has(c.email.toLowerCase()));

    contacts = [...newContacts, ...contacts].slice(0, 500);
    persistContacts();
    showToast(`Imported ${newContacts.length} new contact(s)`);
  } catch (err) {
    showToast(err.message || 'Could not import this CSV');
  } finally {
    $('csvFile').value = '';
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('search')?.focus();
  }
});

// Initialization
initAuth();
render();
