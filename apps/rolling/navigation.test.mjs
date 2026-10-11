import test from 'node:test';
import assert from 'node:assert/strict';
import {focusRoute, skipToContent} from './navigation.mjs';
function browserFixture() {
  const calls = [];
  const target = {focus: options => calls.push(['post-focus', options]), scrollIntoView: options => calls.push(['post-scroll', options])};
  const main = {focus: () => calls.push(['main-focus'])};
  const browser = {scrollTo: (...args) => calls.push(['scroll', ...args]), document: {
    getElementById: id => id === 'post-r3' ? target : id === 'content' ? main : null,
    querySelector: () => ({focus: () => calls.push(['heading-focus'])}),
    querySelectorAll: () => []
  }};
  return {calls, target, browser};
}
test('skip action suppresses fragment navigation and focuses main', () => {
  const {calls,browser} = browserFixture();
  let prevented = false;
  skipToContent({preventDefault: () => {prevented = true;}}, browser.document);
  assert.equal(prevented,true);
  assert.deepEqual(calls,[['main-focus']]);
});
test('fresh stable reply link focuses and reveals its reply just like in-app navigation', () => {
  for (const initial of [true,false]) {
    const {calls,target,browser} = browserFixture();
    focusRoute('/thread/first-tools/r3', undefined, initial, browser);
    assert.equal(target.tabIndex,-1);
    assert.deepEqual(calls,[['post-focus',{preventScroll:true}],['post-scroll',{block:'center'}]]);
  }
});
test('fresh Home preserves first-Tab skip-link order, while returning feed restores scroll', () => {
  const {calls,browser} = browserFixture();
  focusRoute('/home',undefined,true,browser);
  assert.deepEqual(calls,[]);
  focusRoute('/home',{y:840},false,browser);
  assert.deepEqual(calls,[['scroll',0,840]]);
});
