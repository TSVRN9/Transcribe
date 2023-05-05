import{S as _e,i as pe,s as me,k as v,a as N,l as g,m as y,h as p,c as w,n as E,b as W,H as u,J as U,C as ue,K as ge,L as se,M as he,N as ke,f as be,t as ve,o as Te,v as J,O as K,x as ye,y as Ee,z as Re,P as Q,A as Ne,q as S,r as V,u as re,B as we}from"../../chunks/index-81fe78fb.js";function de(t){let e,a,c,l,i,n=!1,r,h=!0,b,k,s,f;function _(){cancelAnimationFrame(r),l.paused||(r=ke(_),n=!0),t[9].call(l)}return{c(){e=v("div"),a=v("div"),c=N(),l=v("audio"),b=N(),k=v("div"),this.h()},l(o){e=g(o,"DIV",{class:!0});var d=y(e);a=g(d,"DIV",{}),y(a).forEach(p),c=w(d),l=g(d,"AUDIO",{src:!0}),y(l).forEach(p),b=w(d),k=g(d,"DIV",{}),y(k).forEach(p),d.forEach(p),this.h()},h(){l.controls=!0,se(l.src,i=URL.createObjectURL(t[6]))||E(l,"src",i),E(e,"class","grid")},m(o,d){W(o,e,d),u(e,a),u(e,c),u(e,l),isNaN(t[0])||(l.playbackRate=t[0]),isNaN(t[3])||(l.volume=t[3]),l.muted=t[4],u(e,b),u(e,k),s||(f=[U(l,"ratechange",t[8]),U(l,"timeupdate",_),U(l,"play",t[10]),U(l,"pause",t[10]),U(l,"volumechange",t[11])],s=!0)},p(o,d){d&64&&!se(l.src,i=URL.createObjectURL(o[6]))&&E(l,"src",i),d&1&&!isNaN(o[0])&&(l.playbackRate=o[0]),!n&&d&2&&!isNaN(o[1])&&(l.currentTime=o[1]),n=!1,d&4&&h!==(h=o[2])&&l[h?"pause":"play"](),d&8&&!isNaN(o[3])&&(l.volume=o[3]),d&16&&(l.muted=o[4])},d(o){o&&p(e),s=!1,he(f)}}}function De(t){let e,a,c,l,i,n,r,h,b,k,s=t[6]&&de(t);return{c(){e=v("article"),a=v("div"),c=v("div"),l=N(),i=v("input"),n=N(),r=v("div"),h=N(),s&&s.c(),this.h()},l(f){e=g(f,"ARTICLE",{class:!0});var _=y(e);a=g(_,"DIV",{class:!0});var o=y(a);c=g(o,"DIV",{}),y(c).forEach(p),l=w(o),i=g(o,"INPUT",{type:!0,accept:!0}),n=w(o),r=g(o,"DIV",{}),y(r).forEach(p),o.forEach(p),h=w(_),s&&s.l(_),_.forEach(p),this.h()},h(){E(i,"type","file"),E(i,"accept",".mp3, .ogg, .wav"),E(a,"class","grid"),E(e,"class","container")},m(f,_){W(f,e,_),u(e,a),u(a,c),u(a,l),u(a,i),u(a,n),u(a,r),u(e,h),s&&s.m(e,null),b||(k=U(i,"change",t[7]),b=!0)},p(f,[_]){f[6]?s?s.p(f,_):(s=de(f),s.c(),s.m(e,null)):s&&(s.d(1),s=null)},i:ue,o:ue,d(f){f&&p(e),s&&s.d(),b=!1,k()}}}function Ue(t,e,a){let c;const l=ge();let i,{playbackRate:n=1,currentTime:r=0,paused:h=!0,volume:b=1,muted:k=!1}=e;function s(){i=this.files,a(5,i)}function f(){n=this.playbackRate,a(0,n)}function _(){r=this.currentTime,a(1,r)}function o(){h=this.paused,a(2,h)}function d(){b=this.volume,k=this.muted,a(3,b),a(4,k)}return t.$$set=m=>{"playbackRate"in m&&a(0,n=m.playbackRate),"currentTime"in m&&a(1,r=m.currentTime),"paused"in m&&a(2,h=m.paused),"volume"in m&&a(3,b=m.volume),"muted"in m&&a(4,k=m.muted)},t.$$.update=()=>{t.$$.dirty&32&&a(6,c=i==null?void 0:i[0]),t.$$.dirty&64&&l("ready",!!c)},[n,r,h,b,k,i,c,s,f,_,o,d]}class Ie extends _e{constructor(e){super(),pe(this,e,Ue,De,me,{playbackRate:0,currentTime:1,paused:2,volume:3,muted:4})}}function Oe(t){return Object.entries(t).reduce((e,[a,c])=>({...e,[c]:a}),{})}function ce(t){const e=Math.floor(t/3600).toString().padStart(2,"0"),a=Math.floor(t%3600/60).toString().padStart(2,"0"),c=Math.floor(t%60).toString().padStart(2,"0");return e+":"+a+":"+c}function Se(t){let e,a,c,l,i,n,r;function h(o){t[14](o)}function b(o){t[15](o)}function k(o){t[16](o)}function s(o){t[17](o)}function f(o){t[18](o)}let _={};return t[1]!==void 0&&(_.playbackRate=t[1]),t[2]!==void 0&&(_.currentTime=t[2]),t[3]!==void 0&&(_.paused=t[3]),t[4]!==void 0&&(_.volume=t[4]),t[5]!==void 0&&(_.muted=t[5]),e=new Ie({props:_}),J.push(()=>K(e,"playbackRate",h,t[1])),J.push(()=>K(e,"currentTime",b,t[2])),J.push(()=>K(e,"paused",k,t[3])),J.push(()=>K(e,"volume",s,t[4])),J.push(()=>K(e,"muted",f,t[5])),e.$on("ready",t[19]),{c(){ye(e.$$.fragment)},l(o){Ee(e.$$.fragment,o)},m(o,d){Re(e,o,d),r=!0},p(o,d){const m={};!a&&d&2&&(a=!0,m.playbackRate=o[1],Q(()=>a=!1)),!c&&d&4&&(c=!0,m.currentTime=o[2],Q(()=>c=!1)),!l&&d&8&&(l=!0,m.paused=o[3],Q(()=>l=!1)),!i&&d&16&&(i=!0,m.volume=o[4],Q(()=>i=!1)),!n&&d&32&&(n=!0,m.muted=o[5],Q(()=>n=!1)),e.$set(m)},i(o){r||(be(e.$$.fragment,o),r=!0)},o(o){ve(e.$$.fragment,o),r=!1},d(o){Ne(e,o)}}}function fe(t){let e,a,c,l,i,n=ce(t[0])+"",r,h,b,k,s,f,_,o,d,m,X,I,j,q,D,O,z,G,L,M=Math.round(t[1]*10)*10+"",H,T,B,A,Y,Z,te;return{c(){e=v("article"),a=v("section"),c=N(),l=v("div"),i=S("🚩: "),r=S(n),h=N(),b=v("section"),k=N(),s=v("div"),f=v("button"),_=S("❌"),o=N(),d=v("button"),m=S("🚩"),X=N(),I=v("button"),j=S("⏮"),q=N(),D=v("div"),O=v("button"),z=S("🐢"),G=N(),L=v("button"),H=S(M),T=S("%"),B=N(),A=v("button"),Y=S("🐇"),this.h()},l(F){e=g(F,"ARTICLE",{class:!0});var R=y(e);a=g(R,"SECTION",{}),y(a).forEach(p),c=w(R),l=g(R,"DIV",{class:!0});var $=y(l);i=V($,"🚩: "),r=V($,n),$.forEach(p),h=w(R),b=g(R,"SECTION",{}),y(b).forEach(p),k=w(R),s=g(R,"DIV",{class:!0});var C=y(s);f=g(C,"BUTTON",{"data-tooltip":!0});var ae=y(f);_=V(ae,"❌"),ae.forEach(p),o=w(C),d=g(C,"BUTTON",{"data-tooltip":!0});var le=y(d);m=V(le,"🚩"),le.forEach(p),X=w(C),I=g(C,"BUTTON",{"data-tooltip":!0});var oe=y(I);j=V(oe,"⏮"),oe.forEach(p),C.forEach(p),q=w(R),D=g(R,"DIV",{class:!0});var P=y(D);O=g(P,"BUTTON",{"data-tooltip":!0});var ie=y(O);z=V(ie,"🐢"),ie.forEach(p),G=w(P),L=g(P,"BUTTON",{});var x=y(L);H=V(x,M),T=V(x,"%"),x.forEach(p),B=w(P),A=g(P,"BUTTON",{"data-tooltip":!0});var ne=y(A);Y=V(ne,"🐇"),ne.forEach(p),P.forEach(p),R.forEach(p),this.h()},h(){E(l,"class","centered svelte-4xoqdr"),E(f,"data-tooltip","Reset Flag ("+t[13]("resetFlag")+")"),E(d,"data-tooltip","Flag ("+t[13]("flag")+")"),E(I,"data-tooltip","Go Back ("+t[13]("rewind")+")"),E(s,"class","grid"),E(O,"data-tooltip","Slow Down ("+t[13]("slowDown")+")"),E(A,"data-tooltip","Speed Up ("+t[13]("speedUp")+")"),E(D,"class","grid"),E(e,"class","container")},m(F,R){W(F,e,R),u(e,a),u(e,c),u(e,l),u(l,i),u(l,r),u(e,h),u(e,b),u(e,k),u(e,s),u(s,f),u(f,_),u(s,o),u(s,d),u(d,m),u(s,X),u(s,I),u(I,j),u(e,q),u(e,D),u(D,O),u(O,z),u(D,G),u(D,L),u(L,H),u(L,T),u(D,B),u(D,A),u(A,Y),Z||(te=[U(f,"click",t[9]),U(d,"click",t[8]),U(I,"click",t[10]),U(O,"click",t[12]),U(A,"click",t[11])],Z=!0)},p(F,R){R&1&&n!==(n=ce(F[0])+"")&&re(r,n),R&2&&M!==(M=Math.round(F[1]*10)*10+"")&&re(H,M)},d(F){F&&p(e),Z=!1,he(te)}}}function Ve(t){let e,a,c,l=Se(t),i=t[6]&&fe(t);return{c(){l&&l.c(),e=N(),a=v("div"),i&&i.c()},l(n){l&&l.l(n),e=w(n),a=g(n,"DIV",{});var r=y(a);i&&i.l(r),r.forEach(p)},m(n,r){l&&l.m(n,r),W(n,e,r),W(n,a,r),i&&i.m(a,null),c=!0},p(n,[r]){l.p(n,r),n[6]?i?i.p(n,r):(i=fe(n),i.c(),i.m(a,null)):i&&(i.d(1),i=null)},i(n){c||(be(l),c=!0)},o(n){ve(l),c=!1},d(n){l&&l.d(n),n&&p(e),n&&p(a),i&&i.d()}}}let Le="local";const ee=.1;function Be(t,e,a){let c=0,l=1,i=0,n=!0,r=1,h=!1,b=!1;function k(T,B){Le===T&&a(6,b=B.detail)}const s={flag:()=>a(0,c=i),resetFlag:()=>a(0,c=0),rewind:async()=>{await we(),a(2,i=c)},speedUp:()=>a(1,l+=ee),slowDown:()=>{l-ee>0&&a(1,l-=ee)},togglePlayback:()=>a(3,n=!n)},{flag:f,resetFlag:_,rewind:o,speedUp:d,slowDown:m,togglePlayback:X}=s,I={v:"resetFlag",f:"flag",r:"rewind",">":"speedUp","<":"slowDown"," ":"togglePlayback"},j=Oe(I);function q(T){return j[T]}function D(T){const B=I[T.key];B&&s[B]()}Te(()=>{document.addEventListener("keyup",D)});function O(T){l=T,a(1,l)}function z(T){i=T,a(2,i)}function G(T){n=T,a(3,n)}function L(T){r=T,a(4,r)}function M(T){h=T,a(5,h)}return[c,l,i,n,r,h,b,k,f,_,o,d,m,q,O,z,G,L,M,T=>k("local",T)]}class Me extends _e{constructor(e){super(),pe(this,e,Be,Ve,me,{})}}export{Me as default};
