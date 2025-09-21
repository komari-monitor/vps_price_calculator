
(function() {
    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion !== APP_VERSION) {
        console.log('检测到新版本，清除缓存...');
        const theme = localStorage.getItem('theme');
        const imgHostSettings = localStorage.getItem('imgHostSettings');
        localStorage.clear();
        if (theme) localStorage.setItem('theme', theme);
        if (imgHostSettings) localStorage.setItem('imgHostSettings', imgHostSettings);
        localStorage.setItem('app_version', APP_VERSION);
    }
})();

const imgHost = {
    type: "LskyPro", // 图床类型, 仅支持 LskyPro / EasyImages
    url: "https://image.dooo.ng", // 图床地址, 带上协议头
    token: "", // LskyPro 可为空则使用游客上传, 在 /user/tokens 生成
    copyFormat: "markdown" // 默认为URL格式
};

// 汇率缓存（用于 Komari CNY 换算）
let __ratesCache = null; // { rates: {...}, timestamp: number }
async function ensureRates() {
    if (__ratesCache && Date.now() - __ratesCache.timestamp < 30 * 60 * 1000) {
        return __ratesCache.rates;
    }
    try {
        const res = await fetch(`https://throbbing-sun-9eb6.b7483311.workers.dev`);
        if (!res.ok) throw new Error('rate http error');
        const data = await res.json();
        if (!data || !data.rates) throw new Error('rate format error');
        __ratesCache = { rates: data.rates, timestamp: Date.now() };
        return __ratesCache.rates;
    } catch (e) {
        console.warn('获取汇率失败（CNY换算将不可用）', e);
        return null;
    }
}

function normalizeCurrencyCode(input, region = '') {
    const s = String(input || '').trim().toUpperCase();
    // 常见映射
    if (!s || s === 'CNY' || s === 'RMB' || s.includes('人民币') || s === '￥' || s === '¥') {
        // 处理日元：若仅为 ¥，根据地区尝试判定；默认按 CNY
        if ((s === '¥' || s === '￥') && /JP|🇯🇵/.test(String(region))) return 'JPY';
        return 'CNY';
    }
    if (s === '$' || s.includes('美元') || s === 'USD' || s === 'US$') return 'USD';
    if (s.includes('HKD') || s.includes('港') || s.includes('HK$')) return 'HKD';
    if (s.includes('EUR') || s.includes('欧')) return 'EUR';
    if (s.includes('GBP') || s.includes('英镑') || s.includes('£')) return 'GBP';
    if (s.includes('JPY') || s.includes('日')) return 'JPY';
    if (s.includes('AUD')) return 'AUD';
    if (s.includes('CAD')) return 'CAD';
    if (s.includes('SGD')) return 'SGD';
    if (s.includes('KRW') || s.includes('韩')) return 'KRW';
    if (s.includes('TWD') || s.includes('台') || s.includes('新台币')) return 'TWD';
    return s; // 已经是币种代码时直接返回
}

function convertToCny(rates, code, amount) {
    if (!rates || !code || typeof amount !== 'number') return null;
    const origin = rates[code];
    const cny = rates['CNY'];
    if (!origin || !cny) return null;
    return (cny / origin) * amount;
}

// 将 Komari 的天数周期映射为计算器月周期（链接参数）
function mapDaysToMonths(days) {
    const table = { 30:1, 90:3, 180:6, 365:12, 730:24, 1095:36, 1460:48, 1825:60 };
    if (table[days]) return table[days];
    // 尝试按 30 天近似
    const approx = Math.max(1, Math.min(60, Math.round(days / 30)));
    // 仅接受常见档位，否则返回 0 表示未知
    const allowed = new Set([1,3,6,12,24,36,48,60]);
    return allowed.has(approx) ? approx : 0;
}

function mapCurrencyToCalculator(code) {
    const supported = new Set(['USD','AUD','CAD','CNY','EUR','GBP','HKD','JPY','KRW','SGD','TWD']);
    const up = String(code || '').toUpperCase();
    return supported.has(up) ? up : 'CNY';
}

function buildShareUrlFromNode(node) {
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    const code = mapCurrencyToCalculator(normalizeCurrencyCode(node.currency, node.region || ''));
    if (code) params.set('currency', code);
    const price = typeof node.price === 'number' && node.price > 0 ? node.price : '';
    if (price) params.set('price', String(price));
    const months = mapDaysToMonths(Number(node.billing_cycle) || 0);
    if (months) params.set('cycle', String(months));
    if (node.expired_at) {
        const d = new Date(node.expired_at);
        if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth()+1).padStart(2,'0');
            const day = String(d.getDate()).padStart(2,'0');
            params.set('due', `${y}${m}${day}`);
        }
    }
    return `${base}?${params.toString()}`;
}

function buildKomariShareUrl(addr) {
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    params.set('page', 'komari');
    if (addr) params.set('addr', addr);
    return `${base}?${params.toString()}`;
}

document.addEventListener('DOMContentLoaded', function() {
    
    function showPageAndInitialize() {
        if (document.body.classList.contains('is-loading')) {
            document.body.style.visibility = 'visible';
            document.body.classList.remove('is-loading');
            runInitializations();
        }
    }

    const keyComponents = [
        'md-outlined-text-field',
        'md-outlined-select',
        'md-filled-button'
    ];
    const componentPromises = keyComponents.map(tag => customElements.whenDefined(tag));
    Promise.race(componentPromises).then(() => {
        clearTimeout(safetyTimeout);
        showPageAndInitialize();
    }).catch(error => {
        clearTimeout(safetyTimeout);
        showPageAndInitialize();
    });

    const safetyTimeout = setTimeout(() => {
        showPageAndInitialize();
    }, 3000); // 3秒超时

    function runInitializations() {
        // 初始化主题
        initTheme();
        
        // 初始化日期选择器
        flatpickr.localize(flatpickr.l10ns.zh);
        initializeDatePickers();
        
        // 初始化其他功能
        fetchExchangeRate();
        setDefaultTransactionDate();
        
        // 初始化图床设置
        initSettings();
        
    // 统一添加所有事件监听器
        document.getElementById('currency').addEventListener('change', fetchExchangeRate);
        document.getElementById('calculateBtn').addEventListener('click', calculateAndSend);
        document.getElementById('copyLinkBtn').addEventListener('click', copyLink);
        document.getElementById('screenshotBtn').addEventListener('click', captureAndUpload);
    // Tab 切换
    setupTabs();
    // Komari
    const fetchBtn = document.getElementById('fetchKomariBtn');
    if (fetchBtn) fetchBtn.addEventListener('click', fetchKomariNodes);
        const addrInput = document.getElementById('komariAddress');
        if (addrInput) {
            addrInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    fetchKomariNodes();
                }
            });
        }
        const komariCopyBtn = document.getElementById('komariCopyLinkBtn');
        if (komariCopyBtn) {
            komariCopyBtn.addEventListener('click', () => {
                const addr = document.getElementById('komariAddress')?.value || '';
                const url = buildKomariShareUrl(addr.trim());
                copyToClipboard(url);
                showNotification('Komari 分享链接已复制', 'success');
            });
        }

        // 根据 URL 参数 page 自动切换 Tab（默认 calculator）
        try {
            const pageParam = new URLSearchParams(window.location.search).get('page');
            if (pageParam && String(pageParam).toLowerCase() === 'komari') {
                const tabKomari = document.getElementById('tabKomari');
                tabKomari && tabKomari.click();
            }
        } catch {}

    // 等待Material Web组件加载完成后添加事件监听器
        setTimeout(() => {
            const currencySelect = document.getElementById('currency');
            if (currencySelect && currencySelect.addEventListener) {
                currencySelect.addEventListener('change', fetchExchangeRate);
            }
        }, 100);

        initSettings();
    
        // 添加设置按钮事件监听 - 适配侧边栏
        document.getElementById('settingsToggle').addEventListener('click', openSettingsSidebar);
        document.getElementById('closeSidebar').addEventListener('click', closeSettingsSidebar);
        document.getElementById('sidebarOverlay').addEventListener('click', closeSettingsSidebar);
        document.getElementById('saveSettings').addEventListener('click', saveSettings);
        document.getElementById('resetSettings').addEventListener('click', resetSettings);
        document.querySelector('.toggle-password').addEventListener('click', togglePasswordVisibility);

        // ESC键关闭侧边栏
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeSettingsSidebar();
            }
        });
    }
    populateFormFromUrlAndCalc();
});

// 顶部 Tab 切换
function setupTabs() {
    const tabCalc = document.getElementById('tabCalc');
    const tabKomari = document.getElementById('tabKomari');
    const calcSection = document.querySelector('section.calculator');
    const resultSection = document.getElementById('calcResult');
    const komariSection = document.getElementById('komariSection');

    function activate(tab) {
        if (!tabCalc || !tabKomari) return;
        tabCalc.classList.toggle('active', tab === 'calc');
        tabKomari.classList.toggle('active', tab === 'komari');

        if (tab === 'calc') {
            calcSection.style.display = '';
            resultSection.style.display = '';
            komariSection.style.display = 'none';
        } else {
            calcSection.style.display = 'none';
            resultSection.style.display = 'none';
            komariSection.style.display = '';
        }
    }

    tabCalc && tabCalc.addEventListener('click', () => activate('calc'));
    tabKomari && tabKomari.addEventListener('click', () => activate('komari'));
}

function populateFormFromUrlAndCalc() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.toString() === '') {
        return; // No params, use default behavior
    }

    // 如果仅包含 page=komari 等与计算器无关的参数，不要触发计算
    const pageParam = (urlParams.get('page') || '').toLowerCase();
    const hasCalcParams = urlParams.has('price') && urlParams.has('cycle') && urlParams.has('due');

    if (urlParams.has('currency')) {
        document.getElementById('currency').value = urlParams.get('currency');
    }
    if (urlParams.has('price')) {
        document.getElementById('amount').value = urlParams.get('price');
    }
    if (urlParams.has('cycle')) {
        document.getElementById('cycle').value = urlParams.get('cycle');
    }
    if (urlParams.has('due')) {
        const expiryDate = urlParams.get('due');
        if (expiryDate.match(/^\d{8}$/)) {
            const formattedDate = `${expiryDate.substring(0, 4)}-${expiryDate.substring(4, 6)}-${expiryDate.substring(6, 8)}`;
            document.getElementById('expiryDate').value = formattedDate;
        }
    }
    
    const fetchPromise = fetchExchangeRate(true);

    fetchPromise.then(() => {
        if (urlParams.has('rate')) {
            document.getElementById('customRate').value = urlParams.get('rate');
        }
        // 仅在必要参数齐全时自动计算
        if (hasCalcParams) {
            setTimeout(() => {
                calculateAndSend();
            }, 100);
        }
    });

    // Komari: 支持 addr 参数自动填充并获取
    if (pageParam === 'komari' && urlParams.has('addr')) {
        const addr = urlParams.get('addr');
        const addrInput = document.getElementById('komariAddress');
        if (addrInput) {
            addrInput.value = addr;
            // 若页面已切到 Komari，则自动获取
            setTimeout(() => {
                const tabKomari = document.getElementById('tabKomari');
                if (tabKomari && tabKomari.classList.contains('active')) {
                    fetchKomariNodes();
                }
            }, 150);
        }
    }
}

// 主题切换功能
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle.querySelector('i');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

    // 检查本地存储中的主题设置
    const currentTheme = localStorage.getItem('theme');

    // 应用保存的主题或系统主题
    if (currentTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeIcon.className = 'fas fa-sun';
    } else if (currentTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        themeIcon.className = 'fas fa-moon';
    } else if (prefersDarkScheme.matches) {
        // 如果没有保存的主题但系统偏好暗色模式
        document.documentElement.setAttribute('data-theme', 'dark');
        themeIcon.className = 'fas fa-sun';
        localStorage.setItem('theme', 'dark');
    } else {
        // 默认使用亮色主题
        document.documentElement.setAttribute('data-theme', 'light');
        themeIcon.className = 'fas fa-moon';
        localStorage.setItem('theme', 'light');
    }

    // 切换主题
    themeToggle.addEventListener('click', function() {
        let theme;
        if (document.documentElement.getAttribute('data-theme') === 'dark') {
            document.documentElement.setAttribute('data-theme', 'light');
            theme = 'light';
            themeIcon.className = 'fas fa-moon';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            theme = 'dark';
            themeIcon.className = 'fas fa-sun';
        }

        // 保存主题设置到本地存储
        localStorage.setItem('theme', theme);
    });
}

function initializeDatePickers() {
    flatpickr("#expiryDate", {
        dateFormat: "Y-m-d",
        locale: "zh",
        placeholder: "选择到期日期",
        minDate: "today",
        onChange: function(_selectedDates, dateStr) {
            const transactionPicker = document.getElementById('transactionDate')._flatpickr;
            transactionPicker.set('maxDate', dateStr);
            validateDates();
        }
    });

    flatpickr("#transactionDate", {
        dateFormat: "Y-m-d",
        locale: "zh",
        placeholder: "选择交易日期",
        onChange: validateDates
    });
}

function validateDates() {
    const expiryDateInput = document.getElementById('expiryDate').value;
    const transactionDateInput = document.getElementById('transactionDate').value;
    
    if (!expiryDateInput || !transactionDateInput) return;

    const expiryDate = new Date(expiryDateInput);
    const transactionDate = new Date(transactionDateInput);
    const today = new Date();

    // 设置所有时间为当天的开始（00:00:00）
    expiryDate.setHours(0, 0, 0, 0);
    transactionDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    if (expiryDate <= today) {
        showNotification('到期日期必须晚于今天', 'error');
        document.getElementById('expiryDate').value = '';
        return;
    }

    if (transactionDate > expiryDate) {
        showNotification('交易日期不能晚于到期日期', 'error');
        setDefaultTransactionDate();
        return;
    }

    if (expiryDate.getTime() === transactionDate.getTime()) {
        showNotification('交易日期不能等于到期日期', 'error');
        setDefaultTransactionDate();
        return;
    }

    updateRemainingDays();
}

function updateRemainingDays() {
    const expiryDate = document.getElementById('expiryDate').value;
    const transactionDate = document.getElementById('transactionDate').value;

    if (expiryDate && transactionDate) {
        const remainingDays = calculateRemainingDays(expiryDate, transactionDate);
        
        // 检查是否存在remainingDays元素
        const remainingDaysElement = document.getElementById('remainingDays');
        if (remainingDaysElement) {
            remainingDaysElement.textContent = remainingDays;
            
            if (remainingDays === 0) {
                showNotification('剩余天数为0，请检查日期设置', 'warning');
            }
        }
    }
}

/**
 * 实时汇率获取 @pengzhile
 * 代码来源: https://linux.do/t/topic/227730/27
 * 
 * 该函数用于从API获取最新汇率并计算与人民币的兑换比率
 */
function fetchExchangeRate(isFromUrlLoad = false) {
  const currency = document.getElementById('currency').value;
  const customRateField = document.getElementById('customRate');
  
  return fetch(`https://throbbing-sun-9eb6.b7483311.workers.dev`)
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! 状态: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    const originRate = data.rates[currency];
    const targetRate = data.rates.CNY;
    const rate = targetRate/originRate;
	
    const utcDate = new Date(data.timestamp);
    const eastEightTime = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));

    const year = eastEightTime.getUTCFullYear();
    const month = String(eastEightTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(eastEightTime.getUTCDate()).padStart(2, '0');
    const hours = String(eastEightTime.getUTCHours()).padStart(2, '0');
    const minutes = String(eastEightTime.getUTCMinutes()).padStart(2, '0');
    
    const formattedDate = `${year}/${month}/${day} ${hours}:${minutes}`;
    
    document.getElementById('exchangeRate').value = rate.toFixed(3);
    
    const urlParams = new URLSearchParams(window.location.search);
    if (!isFromUrlLoad || !urlParams.has('rate')) {
        customRateField.value = rate.toFixed(3);
    }

    const exchangeRateField = document.getElementById('exchangeRate');
    exchangeRateField.setAttribute('supporting-text', `更新时间: ${formattedDate}`);
  })
  .catch(error => {
    console.error('Error fetching the exchange rate:', error);
    showNotification('获取汇率失败，请稍后再试。', 'error');
  });
}

function setDefaultTransactionDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const defaultDate = `${year}-${month}-${day}`;
    document.getElementById('transactionDate').value = defaultDate;
    if (document.getElementById('transactionDate')._flatpickr) {
        document.getElementById('transactionDate')._flatpickr.setDate(defaultDate);
    }
}

function calculateRemainingDays(expiryDate, transactionDate) {
    const expiry = new Date(expiryDate);
    const transaction = new Date(transactionDate);

    // 设置所有时间为当天的开始（00:00:00）
    expiry.setHours(0, 0, 0, 0);
    transaction.setHours(0, 0, 0, 0);
    
    // 如果到期日早于或等于交易日期，返回0
    if (expiry <= transaction) {
        return 0;
    }

    // 计算天数差异
    const timeDiff = expiry.getTime() - transaction.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));

    return daysDiff;
}

function getCycleStartDate(expiryDateStr, cycleMonths) {
  const end   = new Date(expiryDateStr);
  const start = new Date(end);
  start.setMonth(start.getMonth() - cycleMonths);

  if (start.getDate() !== end.getDate()) {
    start.setDate(0);
  }
  return start;
}

function calculateAndSend() {
  const customRate      = parseFloat(document.getElementById('customRate').value);
  const amount          = parseFloat(document.getElementById('amount').value);
  const cycle           = parseInt(document.getElementById('cycle').value); // 1,3,6,12...
  const expiryDate      = document.getElementById('expiryDate').value;     // yyyy-mm-dd
  const transactionDate = document.getElementById('transactionDate').value;

  if (!(customRate && amount && cycle && expiryDate && transactionDate)) {
    showNotification('请填写所有字段并确保输入有效', 'error');
    return;
  }


  const localAmount = amount * customRate;

  // 整个计费周期的天数
  const cycleStart       = getCycleStartDate(expiryDate, cycle);
  const totalCycleDays   = calculateRemainingDays(expiryDate, cycleStart.toISOString().slice(0,10));

  // 当前剩余天数
  const remainingDays    = calculateRemainingDays(expiryDate, transactionDate);

  // 真实日费 & 剩余价值
  const dailyValue       = localAmount / totalCycleDays;
  const remainingValue   = (dailyValue * remainingDays).toFixed(2);

  const data = {
    price: localAmount,
    time:  remainingDays,
    customRate,
    amount,
    cycle,
    expiryDate,
    transactionDate,
    bidAmount: 0
  };
  updateResults({ remainingValue }, data);
  showNotification('计算完成！', 'success');

  if (parseFloat(remainingValue) >= 1000) {
    triggerConfetti();
  }
}


function updateResults(result, data) {
    document.getElementById('resultDate').innerText = data.transactionDate;
    document.getElementById('resultForeignRate').innerText = data.customRate.toFixed(3);
    
    // 计算年化价格
    const price = parseFloat(data.price);
    const cycleText = getCycleText(data.cycle);
    document.getElementById('resultPrice').innerText = `${price.toFixed(2)} 人民币/${cycleText}`;
    
    document.getElementById('resultDays').innerText = data.time;
    document.getElementById('resultExpiry').innerText = data.expiryDate;
    
    const resultValueElement = document.getElementById('resultValue');
    let copyIcon = document.createElement('i');
    copyIcon.className = 'fas fa-copy copy-icon';
    copyIcon.title = '复制到剪贴板';

    resultValueElement.innerHTML = '';
    resultValueElement.appendChild(document.createTextNode(`${result.remainingValue} 元 `));
    resultValueElement.appendChild(copyIcon);
    
    if (parseFloat(result.remainingValue) >= 1000) {
        resultValueElement.classList.add('high-value-result');
    } else {
        resultValueElement.classList.remove('high-value-result');
    }
    
    resultValueElement.style.cursor = 'pointer';
    
    resultValueElement.addEventListener('click', function() {
        copyToClipboard(result.remainingValue);
    });
    
    copyIcon.addEventListener('click', function(e) {
        e.stopPropagation();
        copyToClipboard(result.remainingValue);
    });

    document.getElementById('calcResult').scrollIntoView({ behavior: 'smooth' });
}

function copyToClipboard(text) {
    // 使用现代 Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('已复制到剪贴板！', 'success');
        }).catch(() => {
            // 回退到传统方法
            fallbackCopyToClipboard(text);
        });
    } else {
        // 回退到传统方法
        fallbackCopyToClipboard(text);
    }
}

function fallbackCopyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);

    textarea.select();
    try {
        document.execCommand('copy');
        showNotification('已复制到剪贴板！', 'success');
    } catch (err) {
        showNotification('复制失败，请手动复制', 'error');
    }

    document.body.removeChild(textarea);
}

function showNotification(message, type) {
    const notifications = document.getElementById('notifications') || createNotificationsContainer();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    if (notifications.firstChild) {
        notifications.insertBefore(notification, notifications.firstChild);
    } else {
        notifications.appendChild(notification);
    }

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        
        setTimeout(() => {
            notification.remove();
            
            if (notifications.children.length === 0) {
                notifications.remove();
            }
        }, 300);
    }, 3000);
}

function createNotificationsContainer() {
    const container = document.createElement('div');
    container.id = 'notifications';
    document.body.appendChild(container);
    return container;
}


/**
 * 捕获计算结果并上传到图床
 */
function captureAndUpload() {
    // 检查是否有计算结果
    const resultValue = document.getElementById('resultValue');
    if (resultValue.textContent.trim() === '0.000 元') {
        showNotification('请先计算剩余价值再截图', 'error');
        return;
    }

    // 显示加载中通知
    showNotification('正在生成截图...', 'info');
    
    // 使用 html2canvas 捕获结果区域
    html2canvas(document.getElementById('calcResult'), {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--card-background-color'),
        scale: 2, // 使用2倍缩放以获得更清晰的图像
        logging: false,
        useCORS: true
    }).then(function(canvas) {
        showNotification('截图生成成功，正在上传...', 'info');
        
        // 转换为 base64 数据 URL
        const imageData = canvas.toDataURL('image/png');
        
        // 上传到选定的图床
        uploadImage(imageData);
    }).catch(function(error) {
        console.error('截图生成失败:', error);
        showNotification('截图生成失败，请重试', 'error');
    });
}

/**
 * 将图片上传到配置的图床
 * @param {string} imageData - base64 格式的图像数据
 */
function uploadImage(imageData) {
    // 从 base64 数据创建 Blob
    const byteString = atob(imageData.split(',')[1]);
    const mimeType = imageData.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    
    const blob = new Blob([ab], {type: mimeType});
    const file = new File([blob], "calculator-result.png", {type: mimeType});
    
    // 根据图床类型选择不同的上传方法
    switch(imgHost.type) {
        case 'LskyPro':
            uploadToLskyPro(file);
            break;
        case 'EasyImages':
            uploadToEasyImages(file);
            break;
        default:
            showNotification(`不支持的图床类型: ${imgHost.type}，请设置为 LskyPro 或 EasyImages`, 'error');
    }
}

/**
 * 上传到 LskyPro 图床
 * 代码参考: https://greasyfork.org/zh-CN/scripts/487553-nodeseek-%E7%BC%96%E8%BE%91%E5%99%A8%E5%A2%9E%E5%BC%BA
 * 
 * @param {File} file - 要上传的文件
 */
function uploadToLskyPro(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const headers = {
        'Accept': 'application/json'
    };
    
    if (imgHost.token) {
        headers['Authorization'] = `Bearer ${imgHost.token}`;
    }
    
    fetch(`${imgHost.url}/api/v1/upload`, {
        method: 'POST',
        headers: headers,
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.status === true && data.data && data.data.links) {
            // 获取图片URL
            const imageUrl = data.data.links.url;
            let clipboardText = imageUrl;
            
            // 如果设置为Markdown格式，则生成Markdown格式的文本
            if (imgHost.copyFormat === 'markdown') {
                clipboardText = `![剩余价值计算结果](${imageUrl})`;
            }
            
            // 复制到剪贴板
            copyToClipboard(clipboardText);
            
            // 显示通知，指明使用了哪种格式
            const formatText = imgHost.copyFormat === 'markdown' ? 'Markdown格式' : '链接';
            showNotification(`截图上传成功，${formatText}已复制到剪贴板！`, 'success');
        } else {
            showNotification('图片上传失败', 'error');
            console.error('上传响应异常:', data);
        }
    })
    .catch(error => {
        console.error('上传图片失败:', error);
        showNotification('上传图片失败，请重试', 'error');
    });
}

/**
 * 上传到 EasyImages 图床 
 * 代码参考: https://greasyfork.org/zh-CN/scripts/487553-nodeseek-%E7%BC%96%E8%BE%91%E5%99%A8%E5%A2%9E%E5%BC%BA
 * 
 * @param {File} file - 要上传的文件
 */
function uploadToEasyImages(file) {
    const formData = new FormData();
    let url = imgHost.url;
    
    if (imgHost.token) {
        // 使用后端API
        url += '/api/index.php';
        formData.append('token', imgHost.token);
        formData.append('image', file);
    } else {
        // 使用前端API
        url += '/app/upload.php';
        formData.append('file', file);
        formData.append('sign', Math.floor(Date.now() / 1000));
    }
    
    fetch(url, {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.code === 200 && data.url) {
            // 获取图片URL
            const imageUrl = data.url;
            let clipboardText = imageUrl;
            
            // 如果设置为Markdown格式，则生成Markdown格式的文本
            if (imgHost.copyFormat === 'markdown') {
                clipboardText = `![剩余价值计算结果](${imageUrl})`;
            }
            
            // 复制到剪贴板
            copyToClipboard(clipboardText);
            
            // 显示通知，指明使用了哪种格式
            const formatText = imgHost.copyFormat === 'markdown' ? 'Markdown格式' : '链接';
            showNotification(`截图上传成功，${formatText}已复制到剪贴板！`, 'success');
        } else {
            showNotification('图片上传失败', 'error');
            console.error('上传响应异常:', data);
        }
    })
    .catch(error => {
        console.error('上传图片失败:', error);
        showNotification('上传图片失败，请重试', 'error');
    });
}




/**
 * 初始化设置界面
 */
function initSettings() { 
    const savedSettings = localStorage.getItem('imgHostSettings');
        
    if (savedSettings) {
        // 不是第一次启动，加载保存的设置
        const parsedSettings = JSON.parse(savedSettings);
                
        imgHost.type = parsedSettings.type || imgHost.type;
        imgHost.url = parsedSettings.url || imgHost.url;
        imgHost.token = parsedSettings.token || imgHost.token;
        imgHost.copyFormat = parsedSettings.copyFormat || imgHost.copyFormat;
                
        document.getElementById('imgHostType').value = imgHost.type;
        document.getElementById('imgHostUrl').value = imgHost.url;
        document.getElementById('imgHostToken').value = imgHost.token || '';

        if (imgHost.copyFormat === 'markdown') {
            document.getElementById('copyFormatMarkdown').checked = true;
        } else {
            document.getElementById('copyFormatUrl').checked = true;
        }
        
    } else {

        // 也可以在这里设置默认值到UI
        document.getElementById('imgHostType').value = imgHost.type;
        document.getElementById('imgHostUrl').value = imgHost.url;
        document.getElementById('imgHostToken').value = '';
        
        if (imgHost.copyFormat === 'markdown') {
            document.getElementById('copyFormatMarkdown').checked = true;
        } else {
            document.getElementById('copyFormatUrl').checked = true;
        }
    }
}

/**
 * 打开设置侧边栏
 */
function openSettingsSidebar() {
    const sidebar = document.getElementById('settingsSidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.add('active');
    overlay.classList.add('active');

    // 防止背景滚动
    document.body.style.overflow = 'hidden';
}

/**
 * 关闭设置侧边栏
 */
function closeSettingsSidebar() {
    const sidebar = document.getElementById('settingsSidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.remove('active');
    overlay.classList.remove('active');

    // 恢复背景滚动
    document.body.style.overflow = '';
}

/**
 * 保存设置 - 适配Material Web组件
 */
function saveSettings() {
    const type = document.getElementById('imgHostType').value;
    const url = document.getElementById('imgHostUrl').value;
    const token = document.getElementById('imgHostToken').value;

    // 获取选中的复制格式 - 适配Material Web md-radio组件
    let copyFormat = 'markdown';
    const markdownRadio = document.getElementById('copyFormatMarkdown');
    const urlRadio = document.getElementById('copyFormatUrl');

    if (markdownRadio && markdownRadio.checked) {
        copyFormat = 'markdown';
    } else if (urlRadio && urlRadio.checked) {
        copyFormat = 'url';
    }
    
    if (!url) {
        showNotification('图床地址不能为空', 'error');
        return;
    }
    
    // 确保URL格式正确
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showNotification('图床地址必须包含 http:// 或 https://', 'error');
        return;
    }
    
    // 更新imgHost对象 - 使用对象属性更新而不是重新赋值
    imgHost.type = type;
    imgHost.url = url;
    imgHost.token = token;
    imgHost.copyFormat = copyFormat;

    try {
        localStorage.setItem('imgHostSettings', JSON.stringify(imgHost));
        showNotification('设置已保存', 'success');
        closeSettingsSidebar();
    } catch (error) {
        showNotification('设置保存失败，可能是浏览器限制', 'error');
    }
}


function resetSettings() {
    if (confirm('确定要恢复默认设置吗？')) {
        // 使用对象属性更新
        imgHost.type = "LskyPro";
        imgHost.url = "https://image.dooo.ng";
        imgHost.token = "";
        imgHost.copyFormat = "markdown";
        
        // 更新表单值
        document.getElementById('imgHostType').value = imgHost.type;
        document.getElementById('imgHostUrl').value = imgHost.url;
        document.getElementById('imgHostToken').value = imgHost.token;
        document.getElementById('copyFormatMarkdown').checked = true;
        
        // 保存到本地存储
        try {
            localStorage.setItem('imgHostSettings', JSON.stringify(imgHost));
            showNotification('已恢复默认设置', 'success');
        } catch (error) {
            showNotification('设置重置失败，可能是浏览器限制', 'error');
        }
    }
}


function togglePasswordVisibility() {
    const passwordInput = document.getElementById('imgHostToken');
    const toggleBtn = document.querySelector('.toggle-password i');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.className = 'fas fa-eye-slash';
    } else {
        passwordInput.type = 'password';
        toggleBtn.className = 'fas fa-eye';
    }
}


function triggerConfetti() {
    confetti({
        particleCount: 15,
        angle: 60,
        spread: 40,
        origin: { x: 0 },
        colors: ['#FFD700'],
        zIndex: 2000
    });
    
    confetti({
        particleCount: 15,
        angle: 120,
        spread: 40,
        origin: { x: 1 },
        colors: ['#FFD700'],
        zIndex: 2000
    });  
}

function getCycleText(cycle) {
    switch(parseInt(cycle)) {
        case 1: return '月';
        case 3: return '季度';
        case 6: return '半年';
        case 12: return '年';
        case 24: return '两年';
        case 36: return '三年';
        case 48: return '四年';
        case 60: return '五年';
        default: return '未知周期';
    }
}

function copyLink() {
    const currency = document.getElementById('currency').value;
    const price = document.getElementById('amount').value;
    const cycle = document.getElementById('cycle').value;
    const expiryDate = document.getElementById('expiryDate').value;

    const params = new URLSearchParams();
    if (currency) params.set('currency', currency);
    if (price) params.set('price', price);
    if (cycle) params.set('cycle', cycle);
    if (expiryDate) params.set('due', expiryDate.replace(/-/g, ''));

    const url = new URL(window.location.href);
    url.search = params.toString();

    copyToClipboard(url.toString());
}

// ---------- Komari 统计 ----------
async function fetchKomariNodes() {
    const addrInput = document.getElementById('komariAddress');
    const statusEl = document.getElementById('komariStatus');
    const totalsEl = document.getElementById('komariTotals');
    const grid = document.getElementById('komariGrid');
    const raw = (addrInput.value || '').trim();
    if (!raw) {
        showNotification('请输入 Komari 地址', 'error');
        return;
    }
    const base = normalizeBaseUrl(raw);
    statusEl.textContent = '请求中… 如失败可能是浏览器的 CORS 限制。';
    grid.innerHTML = '';
    totalsEl.textContent = '';

    const body = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'common:getNodes',
        params: {}
    };

    // 先试 https，再 http
    const candidates = base.startsWith('http') ? [base] : [`https://${base}`, `http://${base}`];
    let resp, urlTried = '';
    for (const b of candidates) {
        urlTried = `${b.replace(/\/$/, '')}/api/rpc2`;
        try {
            resp = await fetch(urlTried, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (resp.ok) break;
        } catch (e) {
            // try next
        }
    }

    if (!resp || !resp.ok) {
        statusEl.textContent = '请求失败。若服务可用，请从服务器端开启允许跨域请求或通过反向代理。';
        return;
    }

    let data;
    try { data = await resp.json(); } catch { data = null; }
    if (!data || !data.result || typeof data.result !== 'object') {
        statusEl.textContent = '返回数据格式不符合预期。';
        return;
    }

    const nodes = Object.values(data.result);
    if (!nodes.length) {
        statusEl.textContent = '没有节点数据。';
        return;
    }

    // 渲染
    statusEl.textContent = `共 ${nodes.length} 个节点`;
            const now = new Date();
            grid.innerHTML = '';
                const rates = await ensureRates();
            if (!rates) {
                showNotification('汇率获取失败，CNY换算将显示为 “—”', 'warning');
            }
        let totalCny = 0;
        const totalsOriginal = {}; // 原币种合计：{ USD: 123, HKD: 45, ... }
    for (const n of nodes) {
        // 记录来源地址以便构造分享链接
        n.__source_addr = normalizeBaseUrl(raw);
            const card = buildKomariCard(n, now, rates);
        grid.appendChild(card);
                // 统计总剩余价值（CNY）
                        const { currency = '￥', price = 0, billing_cycle = 30, expired_at = '' } = n || {};
                const info = parseExpiryStatus(expired_at, now);
                const code = normalizeCurrencyCode(currency, n.region || '');
                let remainingOriginal = 0;
                if (price === -1) {
                    remainingOriginal = 0; // 免费
                } else if (typeof price === 'number') {
                    if (info.longTerm) {
                        remainingOriginal = Math.max(0, price);
                    } else if (price > 0) {
                        const daily = billing_cycle > 0 ? price / billing_cycle : 0;
                        remainingOriginal = info.daysRemaining > 0 ? daily * info.daysRemaining : 0;
                    }
                }
                        if (!totalsOriginal[code]) totalsOriginal[code] = 0;
                        totalsOriginal[code] += remainingOriginal;
                const cnyVal = convertToCny(rates, code, remainingOriginal);
                totalCny += cnyVal || 0;
    }

                    // 渲染总价值：￥XXX【换算CNY后的价格】(JPY 97.00 + USD 3.30 + HKD 54.36)【原始】
                    const cnyPart = rates ? `￥${totalCny.toFixed(2)}` : `—`;
                    const originalParts = [];
                        for (const [code, val] of Object.entries(totalsOriginal)) {
                            if (val > 0.0001) originalParts.push(`${code} ${val.toFixed(2)}`);
                        }
                    const originalsStr = originalParts.length ? ` (${originalParts.join(' + ')})` : '';
                    totalsEl.textContent = `总剩余价值：${cnyPart}${originalsStr}`;
}

function normalizeBaseUrl(input) {
    let s = input.trim();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
}

function buildKomariCard(node, now = new Date(), rates = null) {
    const {
        name = '-',
        region = '',
        price = 0,
        billing_cycle = 30,
        currency = '￥',
        expired_at = '',
                updated_at = ''
    } = node || {};

    const expiryInfo = parseExpiryStatus(expired_at, now);
    const remainingDays = expiryInfo.daysRemaining;

        const code = normalizeCurrencyCode(currency, region);
        // 价格含义：>0 为周期总价；0 未设置；-1 免费
        const isFree = price === -1;
        const isUnset = price === 0;
        const hasPrice = typeof price === 'number' && price > 0;
        const daily = hasPrice && billing_cycle > 0 ? price / billing_cycle : 0;
        let remainingValue = 0; // 原币种
        if (isFree) {
            remainingValue = 0;
        } else if (expiryInfo.longTerm) {
            // 长期有效：剩余价值 = 当前价值（按用户要求，取当前周期价）
            remainingValue = hasPrice ? price : 0;
        } else if (hasPrice) {
            remainingValue = remainingDays > 0 ? daily * remainingDays : 0;
        }
        const remainingValueCny = convertToCny(rates, code, remainingValue);

    const mdCard = document.createElement('md-card');
    mdCard.className = 'komari-card md-elevation--1';

    // 标题行
    const title = document.createElement('div');
    title.className = 'title';
        title.innerHTML = `
                <span class="md-typescale-title-small">${region ? `${escapeHtml(region)} ` : ''}${escapeHtml(name)}</span>
                <span class="badges">
                    <span class="badge ${badgeClass(expiryInfo)}" title="${expiryInfo.tooltip}">${expiryInfo.label}</span>
                    <span class="badge ${remainingValue > 0 ? 'ok' : (isFree ? 'ok' : 'muted')}" title="剩余价值">
                        ${isFree ? '免费' : `${escapeHtml(currency)}${remainingValue.toFixed(2)}`}
                    </span>
                </span>
        `;

    // 元信息和价值
    const meta = document.createElement('div');
    meta.className = 'meta';
    let priceText;
        if (isFree) priceText = '免费';
        else if (isUnset) priceText = '未设置';
        else priceText = `${currency}${price} / ${billing_cycle}天`;

        const valueText = isFree ? '免费' : (hasPrice ? `${currency}${remainingValue.toFixed(2)}` : '—');
        const dailyText = isFree ? '免费' : (hasPrice ? `${currency}${daily.toFixed(4)}/天` : '—');
        const cnyText = remainingValueCny != null ? `￥${remainingValueCny.toFixed(2)}` : '—';

    meta.innerHTML = `
        <div class="row"><div class="price"><strong>价格</strong> ${priceText}</div><div class="value"><strong>剩余价值</strong> ${valueText}</div></div>
        <div class="row"><div><strong>到期</strong> ${expiryInfo.display}</div><div><strong>日均</strong> ${dailyText}</div></div>
        <div class="row single value"><strong>换算剩余价格</strong> ${cnyText}</div>
    `;

    mdCard.appendChild(title);
    mdCard.appendChild(meta);

    // 复制按钮（右下角）
    const copyBtn = document.createElement('md-icon-button');
    copyBtn.className = 'copy-btn';
    copyBtn.title = '复制计算器分享链接';
    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = buildShareUrlFromNode(node);
        copyToClipboard(url);
        showNotification('计算器分享链接已复制', 'success');
    });
    mdCard.appendChild(copyBtn);
    return mdCard;
}

function parseExpiryStatus(expired_at, now = new Date()) {
    // 规则：
    // - 公元 0002 年以前 => 显示 未设置到期时间
    // - 150 年之后 => 显示 长期有效
    // 其余：计算剩余天数
    const invalid = { label: '未设置到期时间', tooltip: '未设置到期时间', display: '未设置', daysRemaining: 0 };
    if (!expired_at) return invalid;
    const d = new Date(expired_at);
    if (isNaN(d.getTime())) return invalid;
    const year = d.getUTCFullYear();
    if (year < 2) return invalid;
    const diffYears = (d.getTime() - now.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (diffYears > 150) {
        return { label: '长期有效', tooltip: '到期时间超过 150 年', display: '长期有效', daysRemaining: 36525, longTerm: true };
    }

    // 正常计算天数（向下取整）
    const d0 = new Date(d); d0.setHours(0,0,0,0);
    const n0 = new Date(now); n0.setHours(0,0,0,0);
    const days = Math.max(0, Math.floor((d0 - n0) / (24*3600*1000)));
    const display = formatDate(d0);
    const label = days > 0 ? `${days} 天` : '已过期';
    const tooltip = days > 0 ? `剩余 ${days} 天` : '到期时间在过去';
    return { label, tooltip, display, daysRemaining: days, longTerm: false };
}

function badgeClass(info) {
    if (!info) return 'muted';
    if (info.display === '未设置' || info.label === '未设置到期时间') return 'muted';
    if (info.display === '长期有效') return 'ok';
    if (/已过期/.test(info.label)) return 'warn';
    return 'ok';
}

function formatDate(d) {
    if (!(d instanceof Date)) return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
}

function formatDateTime(s) {
    if (!s) return '-';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replaceAll('&','&amp;')
        .replaceAll('<','&lt;')
        .replaceAll('>','&gt;')
        .replaceAll('"','&quot;')
        .replaceAll("'",'&#39;');
}