let generatedCaptcha = "";
let currentEmail = "";
let pendingRegisterEmail = "";
let currentAuthToken = localStorage.getItem("authToken") || "";

const API_BASE_URL = "http://localhost:8001";

function generateCaptcha() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let captcha = "";
  for (let i = 0; i < 6; i++) {
    captcha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  generatedCaptcha = captcha;
  const captchaNode = document.getElementById("captcha-value");
  if (captchaNode) captchaNode.textContent = captcha;
}

function checkPasswordStrength(password) {
  const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (strongRegex.test(password)) {
    return { strong: true, suggestion: "" };
  }

  return {
    strong: false,
    suggestion: "Password is weak. Use at least 8 characters, including uppercase, lowercase, number, and special character."
  };
}

function showMessage(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = msg;
  el.className = "message " + (type || "");
}

function clearOTPInputs(selector = ".otp-container input") {
  document.querySelectorAll(selector).forEach(input => input.value = "");
  const firstInput = document.querySelector(selector);
  if (firstInput) firstInput.focus();
}

function moveNext(current, index) {
  if (current.value.length === 1) {
    const next = current.parentElement.children[index];
    if (next) next.focus();
  }
}

function setAuthToken(token) {
  currentAuthToken = token;
  if (token) {
    localStorage.setItem("authToken", token);
  } else {
    localStorage.removeItem("authToken");
  }
}

async function ensureLoggedIn() {
  if (!currentAuthToken) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${currentAuthToken}` }
    });

    if (!response.ok) {
      setAuthToken("");
      return;
    }

    const data = await response.json();
    if (data.success) {
      document.getElementById("login-section")?.classList.add("hidden");
      document.getElementById("welcome-section")?.classList.remove("hidden");
      const profileContent = document.getElementById("profile-content");
      if (profileContent) {
        profileContent.innerHTML = `
          <div class="profile-details">
            <p><strong>Email:</strong></p>
            <p>${data.user.email}</p>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error("Auth check failed:", error);
  }
}

async function loadProfile() {
  if (!currentAuthToken) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${currentAuthToken}` }
    });

    if (!response.ok) {
      console.error("Failed to load profile");
      return;
    }

    const data = await response.json();
    if (data.success && data.user) {
      const profileContent = document.getElementById("profile-content");
      if (profileContent) {
        profileContent.innerHTML = `
          <div class="profile-details">
            <p><strong>Email:</strong></p>
            <p>${data.user.email}</p>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error("Failed to load profile:", error);
  }
}

function logout() {
  setAuthToken("");
  window.location.href = "index.html";
}

function bindPasswordStrength() {
  const passwordField = document.getElementById("password");
  if (!passwordField) return;

  passwordField.addEventListener("input", function () {
    const password = this.value;
    const strength = checkPasswordStrength(password);
    const msgDiv = document.getElementById("password-strength");
    if (!strength.strong && password.length > 0) {
      msgDiv.textContent = strength.suggestion;
      msgDiv.className = "message error";
    } else {
      msgDiv.textContent = "";
      msgDiv.className = "message";
    }
  });
}

function bindPasswordToggle() {
  const passwordInput = document.getElementById("password");
  const togglePassword = document.getElementById("togglePassword");
  if (!passwordInput || !togglePassword) return;

  togglePassword.addEventListener("click", function () {
    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      this.textContent = "Hide";
      this.title = "Hide Password";
    } else {
      passwordInput.type = "password";
      this.textContent = "Show";
      this.title = "Show Password";
    }
  });
}

async function sendOTP() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const captchaInput = document.getElementById("captcha").value.trim();

  if (!email || !password || !captchaInput) {
    showMessage("login-message", "Please fill all fields ❗", "error");
    return;
  }

  if (captchaInput !== generatedCaptcha) {
    showMessage("login-message", "CAPTCHA is incorrect.", "error");
    generateCaptcha();
    return;
  }

  if (!email.includes("@") || !email.includes(".")) {
    showMessage("login-message", "Please enter a valid email address.", "error");
    return;
  }

  const strength = checkPasswordStrength(password);
  if (!strength.strong) {
    showMessage("login-message", "Please enter a strong password.", "error");
    return;
  }

  currentEmail = email;
  showMessage("login-message", "Sending OTP...", "info");

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/send-login-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (!response.ok) {
      showMessage("login-message", data.detail || "Unable to send OTP.", "error");
      return;
    }

    showMessage("login-message", "OTP sent to your email 📧", "success");
    document.getElementById("login-section").classList.add("hidden");
    document.getElementById("otp-section").classList.remove("hidden");
    clearOTPInputs("#otp-section .otp-container input");
  } catch (error) {
    showMessage("login-message", "Could not reach the backend server.", "error");
    console.error("Login error:", error);
  }
}

async function registerUser() {
  const name = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value.trim();
  const confirmPassword = document.getElementById("register-confirm-password").value.trim();

  if (!name || !email || !password || !confirmPassword) {
    showMessage("register-message", "Please fill all fields ❗", "error");
    return;
  }

  if (!checkPasswordStrength(password).strong) {
    showMessage("register-message", "Please enter a strong password.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("register-message", "Passwords do not match ❗", "error");
    return;
  }

  showMessage("register-message", "Creating your account...", "info");

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, full_name: name })
    });

    const data = await response.json();
    if (!response.ok) {
      showMessage("register-message", data.detail || "Registration failed.", "error");
      return;
    }

    showMessage("register-message", "Registration successful! 🎉 Redirecting to login...", "success");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 2000);
  } catch (error) {
    showMessage("register-message", "Could not reach the backend server.", "error");
    console.error("Register error:", error);
  }
}

async function verifyRegistrationOTP() {
  const inputs = document.querySelectorAll("#register-otp-section .otp-container input");
  let enteredOTP = "";
  inputs.forEach(input => enteredOTP += input.value);

  if (!pendingRegisterEmail) {
    showMessage("register-otp-message", "Please register again first.", "error");
    return;
  }

  if (enteredOTP.length !== 6) {
    showMessage("register-otp-message", "Please enter all 6 digits ❗", "error");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/verify-registration-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingRegisterEmail, otp: enteredOTP })
    });

    const data = await response.json();
    if (!response.ok) {
      showMessage("register-otp-message", data.detail || "OTP verification failed.", "error");
      return;
    }

    showMessage("register-otp-message", "Registration successful 🎉", "success");
    setTimeout(() => {
      document.getElementById("register-otp-section").classList.add("hidden");
      document.getElementById("success-section").classList.remove("hidden");
    }, 1000);
  } catch (error) {
    showMessage("register-otp-message", "Could not verify the OTP. Please try again.", "error");
    console.error("Registration OTP verify error:", error);
  }
}

async function verifyOTP() {
  const inputs = document.querySelectorAll("#otp-section .otp-container input");
  let enteredOTP = "";
  inputs.forEach(input => enteredOTP += input.value);

  if (!currentEmail) {
    showMessage("otp-message", "Please log in again first.", "error");
    return;
  }

  if (enteredOTP.length !== 6) {
    showMessage("otp-message", "Please enter all 6 digits ❗", "error");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/verify-login-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: currentEmail, otp: enteredOTP })
    });

    const data = await response.json();
    if (!response.ok) {
      showMessage("otp-message", data.detail || "OTP verification failed.", "error");
      return;
    }

    setAuthToken(data.access_token);
    showMessage("otp-message", "Login successful 🎉", "success");
    document.getElementById("otp-section").classList.add("hidden");
    document.getElementById("welcome-section").classList.remove("hidden");
    loadProfile();
  } catch (error) {
    showMessage("otp-message", "Could not verify the OTP. Please try again.", "error");
    console.error("Login OTP verify error:", error);
  }
}

function backToLogin() {
  document.getElementById("otp-section").classList.add("hidden");
  document.getElementById("login-section").classList.remove("hidden");
  showMessage("otp-message", "", "");
  showMessage("login-message", "", "");
  clearOTPInputs();
}

function backToRegister() {
  document.getElementById("register-otp-section").classList.add("hidden");
  document.getElementById("register-section").classList.remove("hidden");
  showMessage("register-otp-message", "", "");
  showMessage("register-message", "", "");
  clearOTPInputs("#register-otp-section .otp-container input");
}

function bindRegisterPasswordStrength() {
  const registerPassword = document.getElementById("register-password");
  if (!registerPassword) return;

  registerPassword.addEventListener("input", function () {
    const password = this.value;
    const msgDiv = document.getElementById("register-password-strength");
    if (password.length > 0 && !checkPasswordStrength(password).strong) {
      msgDiv.textContent = "Password is weak. Use at least 8 characters, including uppercase, lowercase, number, and special character.";
      msgDiv.className = "message error";
    } else {
      msgDiv.textContent = "";
      msgDiv.className = "message";
    }
  });
}

function bindRegisterPasswordToggle() {
  const registerPasswordInput = document.getElementById("register-password");
  const registerConfirmPasswordInput = document.getElementById("register-confirm-password");
  const toggleRegisterPassword = document.getElementById("toggleRegisterPassword");
  const toggleRegisterConfirmPassword = document.getElementById("toggleRegisterConfirmPassword");

  if (!registerPasswordInput || !toggleRegisterPassword) return;

  toggleRegisterPassword.addEventListener("click", function () {
    if (registerPasswordInput.type === "password") {
      registerPasswordInput.type = "text";
      this.textContent = "Hide";
      this.title = "Hide Password";
    } else {
      registerPasswordInput.type = "password";
      this.textContent = "Show";
      this.title = "Show Password";
    }
  });

  if (!registerConfirmPasswordInput || !toggleRegisterConfirmPassword) return;

  toggleRegisterConfirmPassword.addEventListener("click", function () {
    if (registerConfirmPasswordInput.type === "password") {
      registerConfirmPasswordInput.type = "text";
      this.textContent = "Hide";
      this.title = "Hide Password";
    } else {
      registerConfirmPasswordInput.type = "password";
      this.textContent = "Show";
      this.title = "Show Password";
    }
  });
}

document.getElementById("refreshCaptcha")?.addEventListener("click", generateCaptcha);
window.onload = function () {
  generateCaptcha();
  bindPasswordStrength();
  bindPasswordToggle();
  bindRegisterPasswordStrength();
  bindRegisterPasswordToggle();
  ensureLoggedIn();
};
