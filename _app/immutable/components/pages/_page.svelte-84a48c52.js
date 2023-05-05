import{S as _e,i as pe,s as me,k as g,a as w,l as v,m as y,h as p,c as D,n as E,b as X,H as s,J as I,C as ue,K as ke,L as se,M as he,B as be,N as Te,f as ge,t as ve,o as ye,v as K,O as Q,x as Ee,y as Re,z as Ne,P as W,A as we,q as S,r as V,u as re}from"../../chunks/index-81fe78fb.js";function ce(e){let t,a,d,l,i,n=!1,r,b=!0,m,k,u,f;function _(){cancelAnimationFrame(r),l.paused||(r=Te(_),n=!0),e[10].call(l)}return{c(){t=g("div"),a=g("div"),d=w(),l=g("audio"),m=w(),k=g("div"),this.h()},l(o){t=v(o,"DIV",{class:!0});var c=y(t);a=v(c,"DIV",{}),y(a).forEach(p),d=D(c),l=v(c,"AUDIO",{src:!0}),y(l).forEach(p),m=D(c),k=v(c,"DIV",{}),y(k).forEach(p),c.forEach(p),this.h()},h(){l.controls=!0,se(l.src,i=URL.createObjectURL(e[6]))||E(l,"src",i),E(t,"class","grid")},m(o,c){X(o,t,c),s(t,a),s(t,d),s(t,l),isNaN(e[0])||(l.playbackRate=e[0]),isNaN(e[2])||(l.volume=e[2]),l.muted=e[3],s(t,m),s(t,k),u||(f=[I(l,"ratechange",e[9]),I(l,"timeupdate",_),I(l,"play",e[11]),I(l,"pause",e[11]),I(l,"volumechange",e[12])],u=!0)},p(o,c){c&64&&!se(l.src,i=URL.createObjectURL(o[6]))&&E(l,"src",i),c&1&&!isNaN(o[0])&&(l.playbackRate=o[0]),!n&&c&32&&!isNaN(o[5])&&(l.currentTime=o[5]),n=!1,c&2&&b!==(b=o[1])&&l[b?"pause":"play"](),c&4&&!isNaN(o[2])&&(l.volume=o[2]),c&8&&(l.muted=o[3])},d(o){o&&p(t),u=!1,he(f)}}}function De(e){let t,a,d,l,i,n,r,b,m,k,u=e[6]&&ce(e);return{c(){t=g("article"),a=g("div"),d=g("div"),l=w(),i=g("input"),n=w(),r=g("div"),b=w(),u&&u.c(),this.h()},l(f){t=v(f,"ARTICLE",{class:!0});var _=y(t);a=v(_,"DIV",{class:!0});var o=y(a);d=v(o,"DIV",{}),y(d).forEach(p),l=D(o),i=v(o,"INPUT",{type:!0,accept:!0}),n=D(o),r=v(o,"DIV",{}),y(r).forEach(p),o.forEach(p),b=D(_),u&&u.l(_),_.forEach(p),this.h()},h(){E(i,"type","file"),E(i,"accept",".mp3, .ogg, .wav"),E(a,"class","grid"),E(t,"class","container")},m(f,_){X(f,t,_),s(t,a),s(a,d),s(a,l),s(a,i),s(a,n),s(a,r),s(t,b),u&&u.m(t,null),m||(k=I(i,"change",e[8]),m=!0)},p(f,[_]){f[6]?u?u.p(f,_):(u=ce(f),u.c(),u.m(t,null)):u&&(u.d(1),u=null)},i:ue,o:ue,d(f){f&&p(t),u&&u.d(),m=!1,k()}}}function Ue(e,t,a){let d;const l=ke();let i,n=0,{playbackRate:r=1,currentTime:b=0,paused:m=!0,volume:k=1,muted:u=!1}=t;async function f(h){await be(),a(5,n=h),a(1,m=!1)}function _(){i=this.files,a(4,i)}function o(){r=this.playbackRate,a(0,r)}function c(){n=this.currentTime,a(5,n)}function N(){m=this.paused,a(1,m)}function C(){k=this.volume,u=this.muted,a(2,k),a(3,u)}return e.$$set=h=>{"playbackRate"in h&&a(0,r=h.playbackRate),"currentTime"in h&&a(7,b=h.currentTime),"paused"in h&&a(1,m=h.paused),"volume"in h&&a(2,k=h.volume),"muted"in h&&a(3,u=h.muted)},e.$$.update=()=>{e.$$.dirty&16&&a(6,d=i==null?void 0:i[0]),e.$$.dirty&64&&l("ready",!!d),e.$$.dirty&32&&a(7,b=n),e.$$.dirty&128&&f(b)},[r,m,k,u,i,n,d,b,_,o,c,N,C]}class Ie extends _e{constructor(t){super(),pe(this,t,Ue,De,me,{playbackRate:0,currentTime:7,paused:1,volume:2,muted:3})}}function Oe(e){return Object.entries(e).reduce((t,[a,d])=>({...t,[d]:a}),{})}function de(e){const t=Math.floor(e/3600).toString().padStart(2,"0"),a=Math.floor(e%3600/60).toString().padStart(2,"0"),d=Math.floor(e%60).toString().padStart(2,"0");return t+":"+a+":"+d}function Se(e){let t,a,d,l,i,n,r;function b(o){e[14](o)}function m(o){e[15](o)}function k(o){e[16](o)}function u(o){e[17](o)}function f(o){e[18](o)}let _={};return e[1]!==void 0&&(_.playbackRate=e[1]),e[2]!==void 0&&(_.currentTime=e[2]),e[3]!==void 0&&(_.paused=e[3]),e[4]!==void 0&&(_.volume=e[4]),e[5]!==void 0&&(_.muted=e[5]),t=new Ie({props:_}),K.push(()=>Q(t,"playbackRate",b,e[1])),K.push(()=>Q(t,"currentTime",m,e[2])),K.push(()=>Q(t,"paused",k,e[3])),K.push(()=>Q(t,"volume",u,e[4])),K.push(()=>Q(t,"muted",f,e[5])),t.$on("ready",e[19]),{c(){Ee(t.$$.fragment)},l(o){Re(t.$$.fragment,o)},m(o,c){Ne(t,o,c),r=!0},p(o,c){const N={};!a&&c&2&&(a=!0,N.playbackRate=o[1],W(()=>a=!1)),!d&&c&4&&(d=!0,N.currentTime=o[2],W(()=>d=!1)),!l&&c&8&&(l=!0,N.paused=o[3],W(()=>l=!1)),!i&&c&16&&(i=!0,N.volume=o[4],W(()=>i=!1)),!n&&c&32&&(n=!0,N.muted=o[5],W(()=>n=!1)),t.$set(N)},i(o){r||(ge(t.$$.fragment,o),r=!0)},o(o){ve(t.$$.fragment,o),r=!1},d(o){we(t,o)}}}function fe(e){let t,a,d,l,i,n=de(e[0])+"",r,b,m,k,u,f,_,o,c,N,C,h,q,z,U,O,G,H,L,M=Math.round(e[1]*10)*10+"",J,T,B,A,Y,Z,te;return{c(){t=g("article"),a=g("section"),d=w(),l=g("div"),i=S("🚩: "),r=S(n),b=w(),m=g("section"),k=w(),u=g("div"),f=g("button"),_=S("❌"),o=w(),c=g("button"),N=S("🚩"),C=w(),h=g("button"),q=S("⏮"),z=w(),U=g("div"),O=g("button"),G=S("🐢"),H=w(),L=g("button"),J=S(M),T=S("%"),B=w(),A=g("button"),Y=S("🐇"),this.h()},l(F){t=v(F,"ARTICLE",{class:!0});var R=y(t);a=v(R,"SECTION",{}),y(a).forEach(p),d=D(R),l=v(R,"DIV",{class:!0});var $=y(l);i=V($,"🚩: "),r=V($,n),$.forEach(p),b=D(R),m=v(R,"SECTION",{}),y(m).forEach(p),k=D(R),u=v(R,"DIV",{class:!0});var P=y(u);f=v(P,"BUTTON",{"data-tooltip":!0});var ae=y(f);_=V(ae,"❌"),ae.forEach(p),o=D(P),c=v(P,"BUTTON",{"data-tooltip":!0});var le=y(c);N=V(le,"🚩"),le.forEach(p),C=D(P),h=v(P,"BUTTON",{"data-tooltip":!0});var oe=y(h);q=V(oe,"⏮"),oe.forEach(p),P.forEach(p),z=D(R),U=v(R,"DIV",{class:!0});var j=y(U);O=v(j,"BUTTON",{"data-tooltip":!0});var ie=y(O);G=V(ie,"🐢"),ie.forEach(p),H=D(j),L=v(j,"BUTTON",{});var x=y(L);J=V(x,M),T=V(x,"%"),x.forEach(p),B=D(j),A=v(j,"BUTTON",{"data-tooltip":!0});var ne=y(A);Y=V(ne,"🐇"),ne.forEach(p),j.forEach(p),R.forEach(p),this.h()},h(){E(l,"class","centered svelte-4xoqdr"),E(f,"data-tooltip","Reset Flag ("+e[13]("resetFlag")+")"),E(c,"data-tooltip","Flag ("+e[13]("flag")+")"),E(h,"data-tooltip","Go Back ("+e[13]("rewind")+")"),E(u,"class","grid"),E(O,"data-tooltip","Slow Down ("+e[13]("slowDown")+")"),E(A,"data-tooltip","Speed Up ("+e[13]("speedUp")+")"),E(U,"class","grid"),E(t,"class","container")},m(F,R){X(F,t,R),s(t,a),s(t,d),s(t,l),s(l,i),s(l,r),s(t,b),s(t,m),s(t,k),s(t,u),s(u,f),s(f,_),s(u,o),s(u,c),s(c,N),s(u,C),s(u,h),s(h,q),s(t,z),s(t,U),s(U,O),s(O,G),s(U,H),s(U,L),s(L,J),s(L,T),s(U,B),s(U,A),s(A,Y),Z||(te=[I(f,"click",e[9]),I(c,"click",e[8]),I(h,"click",e[10]),I(O,"click",e[12]),I(A,"click",e[11])],Z=!0)},p(F,R){R&1&&n!==(n=de(F[0])+"")&&re(r,n),R&2&&M!==(M=Math.round(F[1]*10)*10+"")&&re(J,M)},d(F){F&&p(t),Z=!1,he(te)}}}function Ve(e){let t,a,d,l=Se(e),i=e[6]&&fe(e);return{c(){l&&l.c(),t=w(),a=g("div"),i&&i.c()},l(n){l&&l.l(n),t=D(n),a=v(n,"DIV",{});var r=y(a);i&&i.l(r),r.forEach(p)},m(n,r){l&&l.m(n,r),X(n,t,r),X(n,a,r),i&&i.m(a,null),d=!0},p(n,[r]){l.p(n,r),n[6]?i?i.p(n,r):(i=fe(n),i.c(),i.m(a,null)):i&&(i.d(1),i=null)},i(n){d||(ge(l),d=!0)},o(n){ve(l),d=!1},d(n){l&&l.d(n),n&&p(t),n&&p(a),i&&i.d()}}}let Le="local";const ee=.1;function Be(e,t,a){let d=0,l=1,i=0,n=!0,r=1,b=!1,m=!1;function k(T,B){Le===T&&a(6,m=B.detail)}const u={flag:()=>a(0,d=i),resetFlag:()=>a(0,d=0),rewind:async()=>{await be(),a(2,i=d)},speedUp:()=>a(1,l+=ee),slowDown:()=>{l-ee>0&&a(1,l-=ee)},togglePlayback:()=>a(3,n=!n)},{flag:f,resetFlag:_,rewind:o,speedUp:c,slowDown:N,togglePlayback:C}=u,h={v:"resetFlag",f:"flag",r:"rewind",">":"speedUp","<":"slowDown"," ":"togglePlayback"},q=Oe(h);function z(T){return q[T]}function U(T){const B=h[T.key];B&&u[B]()}ye(()=>{document.addEventListener("keyup",U)});function O(T){l=T,a(1,l)}function G(T){i=T,a(2,i)}function H(T){n=T,a(3,n)}function L(T){r=T,a(4,r)}function M(T){b=T,a(5,b)}return[d,l,i,n,r,b,m,k,f,_,o,c,N,z,O,G,H,L,M,T=>k("local",T)]}class Me extends _e{constructor(t){super(),pe(this,t,Be,Ve,me,{})}}export{Me as default};
