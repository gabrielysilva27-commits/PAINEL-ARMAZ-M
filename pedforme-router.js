(() => {
  function mount() {
    const submenu = document.querySelector('.pull-nav-group .module-submenu');
    const main = document.querySelector('#appShell main');
    if (!submenu || !main) return setTimeout(mount, 160);
    if (document.getElementById('pedformeView')) return;

    const view = document.createElement('section');
    view.id = 'pedformeView';
    view.className = 'view hidden';
    view.innerHTML = '<iframe title="Pedforme" src="pedforme.html?v=20260928-1" style="display:block;width:100%;height:calc(100vh - 145px);min-height:700px;border:0;border-radius:10px;background:#eef1f5"></iframe>';
    main.appendChild(view);

    const nav = document.createElement('button');
    nav.type = 'button';
    nav.className = 'nav-link module-sub-link';
    nav.dataset.view = 'pull-pedforme';
    nav.innerHTML = '<span>▤</span> Pedforme';
    submenu.appendChild(nav);
    nav.onclick = () => {
      document.querySelectorAll('main > .view').forEach(v => v.classList.add('hidden'));
      document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
      view.classList.remove('hidden');
      nav.classList.add('active');
      document.querySelector('.pull-nav-group')?.classList.add('open');
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('pageTitle').textContent = 'Puxada';
      document.getElementById('pageSubtitle').textContent = 'Pedforme · pedidos de fornecimento para impressão.';
    };
    document.querySelectorAll('.nav-link').forEach(n => {
      if (n !== nav) n.addEventListener('click', () => view.classList.add('hidden'));
    });
  }
  mount();
})();
