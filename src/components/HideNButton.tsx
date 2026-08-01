'use client';

import { useEffect } from 'react';

export function HideNButton() {
  useEffect(() => {
    // 隐藏 N 按钮的函数
    const hideNButton = () => {
      // 查找所有按钮
      const buttons = document.querySelectorAll('button, [role="button"]');
      buttons.forEach(btn => {
        const text = btn.textContent?.trim();
        const rect = btn.getBoundingClientRect();
        
        // 检查是否是左下角的 N 按钮
        if (
          (text === 'N' || text === 'n') &&
          rect.bottom > window.innerHeight - 150 &&
          rect.left < 150 &&
          rect.width < 100 &&
          rect.height < 100
        ) {
          const el = btn as HTMLElement;
          // 隐藏按钮
          el.style.cssText = 'display: none !important; pointer-events: none !important; opacity: 0 !important; visibility: hidden !important;';
          el.setAttribute('disabled', 'true');
          el.setAttribute('aria-hidden', 'true');
          el.setAttribute('tabindex', '-1');
          
          // 移除点击事件监听
          el.onclick = null;
          el.onmousedown = null;
          el.ontouchstart = null;
        }
      });

      // 也查找包含 N 文本的 div 或 span
      const allElements = document.querySelectorAll('div, span, a');
      allElements.forEach(el => {
        const text = el.textContent?.trim();
        const rect = el.getBoundingClientRect();
        
        if (
          text === 'N' &&
          rect.bottom > window.innerHeight - 150 &&
          rect.left < 150 &&
          rect.width < 100 &&
          rect.height < 100
        ) {
          const htmlEl = el as HTMLElement;
          htmlEl.style.cssText = 'display: none !important; pointer-events: none !important; opacity: 0 !important; visibility: hidden !important;';
        }
      });
    };

    // 立即执行一次
    hideNButton();

    // 延迟执行多次，确保外部脚本加载后也能隐藏
    const timers = [
      setTimeout(hideNButton, 500),
      setTimeout(hideNButton, 1000),
      setTimeout(hideNButton, 2000),
      setTimeout(hideNButton, 3000),
    ];

    // 使用 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver((mutations) => {
      hideNButton();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // 定期执行（每 2 秒）
    const interval = setInterval(hideNButton, 2000);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  return null;
}
