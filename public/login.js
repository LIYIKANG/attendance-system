const form = document.querySelector('#loginForm');

const feedback = document.querySelector('#loginFeedback');

const loginButton = document.querySelector('#loginBtn');

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (window.location.protocol === 'file:') {
    feedback.textContent = '当前是静态预览，请先在项目目录运行 npm start，再访问 http://localhost:3000';
    return;
  }
  const username = document.querySelector('#username').value.trim();
  const password = document.querySelector('#password').value;
  if (!username || !password) {
    feedback.textContent = '请输入用户名和密码';
    return;
  }
  feedback.textContent = '登录中…';
  loginButton.disabled = true;
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username,
        password: password
      })
    });
    const data = await response.json();
    if (!response.ok) {
      feedback.textContent = data.message === 'Invalid username or password' ? '用户名或密码错误' : data.message || '登录失败';
      return;
    }
    localStorage.setItem('attendance-token', data.token);
    localStorage.setItem('attendance-user', JSON.stringify(data.user));
    window.location.href = '/';
  } catch (error) {
    feedback.textContent = '网络错误，请重试';
  } finally {
    loginButton.disabled = false;
  }
});
