const APP_VERSION = '4.2.0';

if (typeof window !== 'undefined') {
    window.APP_VERSION = APP_VERSION;
}

document.addEventListener('DOMContentLoaded', function() {
    const versionElements = document.querySelectorAll('[data-version]');
    versionElements.forEach(element => {
        if (element.hasAttribute('href')) {
            const url = element.getAttribute('href').split('?')[0];
            element.setAttribute('href', `${url}?v=${APP_VERSION}`);
        } else if (element.hasAttribute('src')) {
            const url = element.getAttribute('src').split('?')[0];
            element.setAttribute('src', `${url}?v=${APP_VERSION}`);
        } else {
            element.textContent = APP_VERSION;
        }
    });
});