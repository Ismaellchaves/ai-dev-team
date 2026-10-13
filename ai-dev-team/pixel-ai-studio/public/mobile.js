(() => {
  const breakpoint = window.matchMedia('(max-width: 800px)');
  const toggle = document.querySelector('.mobile-nav-toggle');
  const backdrop = document.querySelector('.mobile-nav-backdrop');
  const sidebar = document.querySelector('.sidebar');

  if (!toggle || !backdrop || !sidebar) return null;

  const setOpen = (open, restoreFocus = false) => {
    const isOpen = breakpoint.matches && open;
    document.body.classList.toggle('mobile-nav-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
    backdrop.hidden = !isOpen;
    sidebar.inert = breakpoint.matches && !isOpen;
    sidebar.setAttribute('aria-hidden', String(breakpoint.matches && !isOpen));

    if (restoreFocus && breakpoint.matches) {
      if (isOpen) sidebar.querySelector('.nav-item')?.focus();
      else toggle.focus();
    }
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true', true);
  });
  backdrop.addEventListener('click', () => setOpen(false, true));
  sidebar.addEventListener('click', event => {
    if (event.target.closest('[data-view], .brand')) setOpen(false, true);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false, true);
    }
  });
  breakpoint.addEventListener('change', () => setOpen(false));
  setOpen(false);

})();
