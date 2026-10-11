// Shared by fresh loads and hash navigation, so stable links use one focus policy.
export function focusRoute(route, savedPosition, initial = false, browser = window) {
  const {document} = browser;
  if (savedPosition) {
    browser.scrollTo(0, savedPosition.y);
    if (savedPosition.focus) {
      [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === savedPosition.focus)?.focus({preventScroll:true});
    }
    return;
  }
  const focusPost = route.startsWith('/thread/') ? route.split('/')[3] : null;
  if (focusPost) {
    const target = document.getElementById(`post-${focusPost}`);
    if (target) {
      target.tabIndex = -1;
      target.focus({preventScroll:true});
      target.scrollIntoView({block:'center'});
      return;
    }
  }
  // Preserve ordinary initial tab order, including the skip link, on page loads.
  if (!initial) {
    browser.scrollTo(0, 0);
    document.querySelector('h1')?.focus({preventScroll:true});
  }
}
export function skipToContent(event, document = window.document) {
  event.preventDefault();
  document.getElementById('content')?.focus();
}
