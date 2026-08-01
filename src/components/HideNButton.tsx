'use client';

import { useEffect } from 'react';

export function HideNButton() {
  useEffect(() => {
    // 延迟执行，确保外部脚本已加载
    const timer = setTimeout(() => {
      // 查找左下角的 N 按钮
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        const rect = btn.getBoundingClientRect();
        // 检查是否在左下角
        if (rect.bottom > window.innerHeight - 100 && rect.left < 100) {
          // 检查是否包含 N 文本
          if (btn.textContent?.trim() === 'N' || btn.textContent?.includes('N')) {
            btn.style.display = 'none';
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0';
            btn.style.visibility = 'hidden';
          }
        }
      });

      // 也尝试通过 class 名查找
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (
          rect.bottom > window.innerHeight - 100 &&
          rect.left < 100 &&
          rect.width < 100 &&
          rect.height < 100
        ) {
          const text = el.textContent?.trim();
          if (text === 'N') {
            (el as HTMLElement).style.display = 'none';
            (el as HTMLElement).style.pointerEvents = 'none';
            (el as HTMLElement).style.opacity = '0';
            (el as HTMLElement).style.visibility = 'hidden';
          }
        }
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
