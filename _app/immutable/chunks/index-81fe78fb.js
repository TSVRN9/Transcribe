function m(){}function H(t,n){for(const e in n)t[e]=n[e];return t}function B(t){return t()}function q(){return Object.create(null)}function y(t){t.forEach(B)}function L(t){return typeof t=="function"}function st(t,n){return t!=t?n==n:t!==n||t&&typeof t=="object"||typeof t=="function"}let g;function ot(t,n){return g||(g=document.createElement("a")),g.href=n,t===g.href}function I(t){return Object.keys(t).length===0}function G(t,...n){if(t==null)return m;const e=t.subscribe(...n);return e.unsubscribe?()=>e.unsubscribe():e}function at(t,n,e){t.$$.on_destroy.push(G(n,e))}function ft(t,n,e,i){if(t){const r=O(t,n,e,i);return t[0](r)}}function O(t,n,e,i){return t[1]&&i?H(e.ctx.slice(),t[1](i(n))):e.ctx}function dt(t,n,e,i){if(t[2]&&i){const r=t[2](i(e));if(n.dirty===void 0)return r;if(typeof r=="object"){const o=[],c=Math.max(n.dirty.length,r.length);for(let s=0;s<c;s+=1)o[s]=n.dirty[s]|r[s];return o}return n.dirty|r}return n.dirty}function _t(t,n,e,i,r,o){if(r){const c=O(n,e,i,o);t.p(c,r)}}function ht(t){if(t.ctx.length>32){const n=[],e=t.ctx.length/32;for(let i=0;i<e;i++)n[i]=-1;return n}return-1}const J=typeof window<"u";let mt=J?t=>requestAnimationFrame(t):m,E=!1;function K(){E=!0}function W(){E=!1}function Q(t,n,e,i){for(;t<n;){const r=t+(n-t>>1);e(r)<=i?t=r+1:n=r}return t}function R(t){if(t.hydrate_init)return;t.hydrate_init=!0;let n=t.childNodes;if(t.nodeName==="HEAD"){const u=[];for(let l=0;l<n.length;l++){const f=n[l];f.claim_order!==void 0&&u.push(f)}n=u}const e=new Int32Array(n.length+1),i=new Int32Array(n.length);e[0]=-1;let r=0;for(let u=0;u<n.length;u++){const l=n[u].claim_order,f=(r>0&&n[e[r]].claim_order<=l?r+1:Q(1,r,x=>n[e[x]].claim_order,l))-1;i[u]=e[f]+1;const a=f+1;e[a]=u,r=Math.max(a,r)}const o=[],c=[];let s=n.length-1;for(let u=e[r]+1;u!=0;u=i[u-1]){for(o.push(n[u-1]);s>=u;s--)c.push(n[s]);s--}for(;s>=0;s--)c.push(n[s]);o.reverse(),c.sort((u,l)=>u.claim_order-l.claim_order);for(let u=0,l=0;u<c.length;u++){for(;l<o.length&&c[u].claim_order>=o[l].claim_order;)l++;const f=l<o.length?o[l]:null;t.insertBefore(c[u],f)}}function U(t,n){if(E){for(R(t),(t.actual_end_child===void 0||t.actual_end_child!==null&&t.actual_end_child.parentNode!==t)&&(t.actual_end_child=t.firstChild);t.actual_end_child!==null&&t.actual_end_child.claim_order===void 0;)t.actual_end_child=t.actual_end_child.nextSibling;n!==t.actual_end_child?(n.claim_order!==void 0||n.parentNode!==t)&&t.insertBefore(n,t.actual_end_child):t.actual_end_child=n.nextSibling}else(n.parentNode!==t||n.nextSibling!==null)&&t.appendChild(n)}function pt(t,n,e){E&&!e?U(t,n):(n.parentNode!==t||n.nextSibling!=e)&&t.insertBefore(n,e||null)}function V(t){t.parentNode&&t.parentNode.removeChild(t)}function X(t){return document.createElement(t)}function j(t){return document.createTextNode(t)}function yt(){return j(" ")}function xt(){return j("")}function gt(t,n,e,i){return t.addEventListener(n,e,i),()=>t.removeEventListener(n,e,i)}function bt(t,n,e){e==null?t.removeAttribute(n):t.getAttribute(n)!==e&&t.setAttribute(n,e)}function Y(t){return Array.from(t.childNodes)}function Z(t){t.claim_info===void 0&&(t.claim_info={last_index:0,total_claimed:0})}function T(t,n,e,i,r=!1){Z(t);const o=(()=>{for(let c=t.claim_info.last_index;c<t.length;c++){const s=t[c];if(n(s)){const u=e(s);return u===void 0?t.splice(c,1):t[c]=u,r||(t.claim_info.last_index=c),s}}for(let c=t.claim_info.last_index-1;c>=0;c--){const s=t[c];if(n(s)){const u=e(s);return u===void 0?t.splice(c,1):t[c]=u,r?u===void 0&&t.claim_info.last_index--:t.claim_info.last_index=c,s}}return i()})();return o.claim_order=t.claim_info.total_claimed,t.claim_info.total_claimed+=1,o}function tt(t,n,e,i){return T(t,r=>r.nodeName===n,r=>{const o=[];for(let c=0;c<r.attributes.length;c++){const s=r.attributes[c];e[s.name]||o.push(s.name)}o.forEach(c=>r.removeAttribute(c))},()=>i(n))}function $t(t,n,e){return tt(t,n,e,X)}function nt(t,n){return T(t,e=>e.nodeType===3,e=>{const i=""+n;if(e.data.startsWith(i)){if(e.data.length!==i.length)return e.splitText(i.length)}else e.data=i},()=>j(n),!0)}function vt(t){return nt(t," ")}function Et(t,n){n=""+n,t.wholeText!==n&&(t.data=n)}function wt(t,n,e,i){e===null?t.style.removeProperty(n):t.style.setProperty(n,e,i?"important":"")}function et(t,n,{bubbles:e=!1,cancelable:i=!1}={}){const r=document.createEvent("CustomEvent");return r.initCustomEvent(t,e,i,n),r}function Nt(t,n){return new t(n)}let p;function h(t){p=t}function C(){if(!p)throw new Error("Function called outside component initialization");return p}function At(t){C().$$.on_mount.push(t)}function St(t){C().$$.after_update.push(t)}function jt(){const t=C();return(n,e,{cancelable:i=!1}={})=>{const r=t.$$.callbacks[n];if(r){const o=et(n,e,{cancelable:i});return r.slice().forEach(c=>{c.call(t,o)}),!o.defaultPrevented}return!0}}const _=[],P=[],$=[],N=[],D=Promise.resolve();let A=!1;function F(){A||(A=!0,D.then(z))}function Ct(){return F(),D}function S(t){$.push(t)}function kt(t){N.push(t)}const w=new Set;let b=0;function z(){const t=p;do{for(;b<_.length;){const n=_[b];b++,h(n),it(n.$$)}for(h(null),_.length=0,b=0;P.length;)P.pop()();for(let n=0;n<$.length;n+=1){const e=$[n];w.has(e)||(w.add(e),e())}$.length=0}while(_.length);for(;N.length;)N.pop()();A=!1,w.clear(),h(t)}function it(t){if(t.fragment!==null){t.update(),y(t.before_update);const n=t.dirty;t.dirty=[-1],t.fragment&&t.fragment.p(t.ctx,n),t.after_update.forEach(S)}}const v=new Set;let d;function Mt(){d={r:0,c:[],p:d}}function qt(){d.r||y(d.c),d=d.p}function rt(t,n){t&&t.i&&(v.delete(t),t.i(n))}function Pt(t,n,e,i){if(t&&t.o){if(v.has(t))return;v.add(t),d.c.push(()=>{v.delete(t),i&&(e&&t.d(1),i())}),t.o(n)}else i&&i()}function Bt(t,n,e,i){const r=t.$$.props[n];r!==void 0&&(t.$$.bound[r]=e,i===void 0&&e(t.$$.ctx[r]))}function Lt(t){t&&t.c()}function Ot(t,n){t&&t.l(n)}function ct(t,n,e,i){const{fragment:r,after_update:o}=t.$$;r&&r.m(n,e),i||S(()=>{const c=t.$$.on_mount.map(B).filter(L);t.$$.on_destroy?t.$$.on_destroy.push(...c):y(c),t.$$.on_mount=[]}),o.forEach(S)}function ut(t,n){const e=t.$$;e.fragment!==null&&(y(e.on_destroy),e.fragment&&e.fragment.d(n),e.on_destroy=e.fragment=null,e.ctx=[])}function lt(t,n){t.$$.dirty[0]===-1&&(_.push(t),F(),t.$$.dirty.fill(0)),t.$$.dirty[n/31|0]|=1<<n%31}function Tt(t,n,e,i,r,o,c,s=[-1]){const u=p;h(t);const l=t.$$={fragment:null,ctx:[],props:o,update:m,not_equal:r,bound:q(),on_mount:[],on_destroy:[],on_disconnect:[],before_update:[],after_update:[],context:new Map(n.context||(u?u.$$.context:[])),callbacks:q(),dirty:s,skip_bound:!1,root:n.target||u.$$.root};c&&c(l.root);let f=!1;if(l.ctx=e?e(t,n.props||{},(a,x,...k)=>{const M=k.length?k[0]:x;return l.ctx&&r(l.ctx[a],l.ctx[a]=M)&&(!l.skip_bound&&l.bound[a]&&l.bound[a](M),f&&lt(t,a)),x}):[],l.update(),f=!0,y(l.before_update),l.fragment=i?i(l.ctx):!1,n.target){if(n.hydrate){K();const a=Y(n.target);l.fragment&&l.fragment.l(a),a.forEach(V)}else l.fragment&&l.fragment.c();n.intro&&rt(t.$$.fragment),ct(t,n.target,n.anchor,n.customElement),W(),z()}h(u)}class Dt{$destroy(){ut(this,1),this.$destroy=m}$on(n,e){if(!L(e))return m;const i=this.$$.callbacks[n]||(this.$$.callbacks[n]=[]);return i.push(e),()=>{const r=i.indexOf(e);r!==-1&&i.splice(r,1)}}$set(n){this.$$set&&!I(n)&&(this.$$.skip_bound=!0,this.$$set(n),this.$$.skip_bound=!1)}}export{ut as A,Ct as B,m as C,ft as D,_t as E,ht as F,dt as G,U as H,at as I,gt as J,jt as K,ot as L,y as M,mt as N,Bt as O,kt as P,Dt as S,yt as a,pt as b,vt as c,qt as d,xt as e,rt as f,Mt as g,V as h,Tt as i,St as j,X as k,$t as l,Y as m,bt as n,At as o,wt as p,j as q,nt as r,st as s,Pt as t,Et as u,P as v,Nt as w,Lt as x,Ot as y,ct as z};