(() => {
  const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

  const sessionCard = document.getElementById('session-card');
  const sessionUsername = document.getElementById('session-username');
  const continueLink = document.getElementById('continue-link');
  const logoutBtn = document.getElementById('logout-btn');

  const authCard = document.getElementById('auth-card');
  const modeTablist = document.getElementById('mode-tablist');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');

  const formHeading = document.getElementById('form-heading');
  const formSubtitle = document.getElementById('form-subtitle');
  const statusBanner = document.getElementById('status-banner');

  const loginForm = document.getElementById('login-form');
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const loginSubmit = document.getElementById('login-submit');

  const registerForm = document.getElementById('register-form');
  const registerUsername = document.getElementById('register-username');
  const registerPassword = document.getElementById('register-password');
  const registerConfirm = document.getElementById('register-confirm');
  const registerSubmit = document.getElementById('register-submit');

  const ruleLength = document.getElementById('rule-length');
  const ruleLetter = document.getElementById('rule-letter');
  const ruleNumber = document.getElementById('rule-number');

  const switchPrompt = document.getElementById('switch-prompt');
  const switchModeBtn = document.getElementById('switch-mode-btn');

  let currentMode = 'login';

  function showStatus(message, type) {
    statusBanner.textContent = message;
    statusBanner.className = `status-banner ${type === 'success' ? 'is-success' : 'is-error'}`;
    statusBanner.hidden = false;
  }

  function clearStatus() {
    statusBanner.hidden = true;
    statusBanner.textContent = '';
    statusBanner.className = 'status-banner';
  }

  function setButtonLoading(button, isLoading, loadingText, defaultText) {
    button.disabled = isLoading;
    button.classList.toggle('is-loading', isLoading);
    const label = button.querySelector('.btn-label');
    if (label) {
      label.textContent = isLoading ? loadingText : defaultText;
    }
  }

  function setMode(mode, options = {}) {
    const { preserveStatus = false, focusField = true } = options;
    currentMode = mode;
    const isRegister = mode === 'register';

    if (!preserveStatus) {
      clearStatus();
    }

    modeTablist.classList.toggle('is-register', isRegister);

    tabLogin.setAttribute('aria-selected', String(!isRegister));
    tabLogin.tabIndex = isRegister ? -1 : 0;

    tabRegister.setAttribute('aria-selected', String(isRegister));
    tabRegister.tabIndex = isRegister ? 0 : -1;

    loginForm.hidden = isRegister;
    registerForm.hidden = !isRegister;

    if (isRegister) {
      document.title = 'Account Access — Create Account';
      formHeading.textContent = 'Create your account';
      formSubtitle.textContent = 'Choose a username and password to get started.';
      switchPrompt.textContent = 'Already have an account?';
      switchModeBtn.textContent = 'Sign in';
      if (focusField) registerUsername.focus();
    } else {
      document.title = 'Account Access — Sign In';
      formHeading.textContent = 'Welcome back';
      formSubtitle.textContent = 'Enter your username and password to continue.';
      switchPrompt.textContent = 'New here?';
      switchModeBtn.textContent = 'Create an account';
      if (focusField) loginUsername.focus();
    }
  }

  function updatePasswordChecklist(value) {
    ruleLength.dataset.met = String(value.length >= 8);
    ruleLetter.dataset.met = String(/[A-Za-z]/.test(value));
    ruleNumber.dataset.met = String(/\d/.test(value));
  }

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || 'Request failed. Please try again.');
    }

    return data;
  }

  async function checkActiveSession() {
    try {
      const data = await apiRequest('/api/auth/me', { method: 'GET' });
      if (data.authenticated && data.user) {
        sessionUsername.textContent = data.user.username;
        continueLink.href = data.redirectUrl || '#';
        authCard.hidden = true;
        sessionCard.hidden = false;
      } else {
        sessionCard.hidden = true;
        authCard.hidden = false;
      }
    } catch {
      sessionCard.hidden = true;
      authCard.hidden = false;
    }
  }

  // Tab switching (click + keyboard arrow support)
  tabLogin.addEventListener('click', () => setMode('login'));
  tabRegister.addEventListener('click', () => setMode('register'));
  switchModeBtn.addEventListener('click', () => {
    setMode(currentMode === 'login' ? 'register' : 'login');
  });

  modeTablist.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const nextMode = currentMode === 'login' ? 'register' : 'login';
      setMode(nextMode, { focusField: false });
      (nextMode === 'login' ? tabLogin : tabRegister).focus();
    }
  });

  // Password show/hide toggles
  document.querySelectorAll('.password-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const targetId = toggle.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;

      const isVisible = input.type === 'text';
      input.type = isVisible ? 'password' : 'text';
      toggle.setAttribute('aria-pressed', String(!isVisible));
      toggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
      input.focus();
    });
  });

  registerPassword.addEventListener('input', (event) => {
    updatePasswordChecklist(event.target.value);
  });

  // Handle Sign In
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus();

    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    if (!username || !password) {
      showStatus('Enter both your username and password.', 'error');
      return;
    }

    setButtonLoading(loginSubmit, true, 'Signing in...', 'Sign in');

    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      showStatus('Signed in. Redirecting you now...', 'success');

      if (typeof data.redirectUrl === 'string' && data.redirectUrl.length > 0) {
        window.setTimeout(() => {
          window.location.assign(data.redirectUrl);
        }, 450);
      }
    } catch (err) {
      showStatus(err.message, 'error');
      setButtonLoading(loginSubmit, false, 'Signing in...', 'Sign in');
    }
  });

  // Handle Registration
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus();

    const username = registerUsername.value.trim();
    const password = registerPassword.value;
    const confirmPassword = registerConfirm.value;

    if (!USERNAME_PATTERN.test(username)) {
      showStatus(
        'Username must be 3–32 characters and use only letters, numbers, dots, underscores, or hyphens.',
        'error'
      );
      registerUsername.focus();
      return;
    }

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      showStatus('Password must be at least 8 characters and include a letter and a number.', 'error');
      registerPassword.focus();
      return;
    }

    if (password !== confirmPassword) {
      showStatus('Passwords do not match.', 'error');
      registerConfirm.focus();
      return;
    }

    setButtonLoading(registerSubmit, true, 'Creating account...', 'Create account');

    try {
      const data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      registerForm.reset();
      updatePasswordChecklist('');

      setMode('login', { preserveStatus: true, focusField: false });
      loginUsername.value = data.user ? data.user.username : username;
      loginPassword.value = '';
      showStatus(data.message || 'Account created. Sign in to continue.', 'success');
      loginPassword.focus();
    } catch (err) {
      showStatus(err.message, 'error');
    } finally {
      setButtonLoading(registerSubmit, false, 'Creating account...', 'Create account');
    }
  });

  // Handle Logout
  logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;

    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      sessionCard.hidden = true;
      authCard.hidden = false;
      setMode('login', { preserveStatus: true, focusField: true });
      showStatus('You have been signed out.', 'success');
    } catch (err) {
      showStatus(err.message, 'error');
    } finally {
      logoutBtn.disabled = false;
    }
  });

  checkActiveSession();
})();
