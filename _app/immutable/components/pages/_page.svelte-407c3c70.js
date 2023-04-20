import{S as pe,i as he,s as _e,k as n,a as N,q as L,l as u,m as c,h as i,c as k,r as S,n as v,b as de,H as e,J as D,u as ce,C as re,K as fe,L as ne,M as ve,N as be}from"../../chunks/index-cd9d66c4.js";function ue(t){let o,l,r,b,a,h,g=!1,E,w=!0,T,I,R,O,F,s,d,m,C,f,B,H,y,J,K,U,V,P,W,A,z=Math.round(t[1]*10)*10+"",Q,X,Y,j,Z,$,ee;function te(){cancelAnimationFrame(E),a.paused||(E=be(te),g=!0),t[16].call(a)}return{c(){o=n("article"),l=n("div"),r=n("div"),b=N(),a=n("audio"),T=N(),I=n("div"),R=N(),O=n("section"),F=N(),s=n("div"),d=n("button"),m=L("❌"),C=N(),f=n("button"),B=L("🚩"),H=N(),y=n("button"),J=L("⏮"),K=N(),U=n("div"),V=n("button"),P=L("🐢"),W=N(),A=n("button"),Q=L(z),X=L("%"),Y=N(),j=n("button"),Z=L("🐇"),this.h()},l(_){o=u(_,"ARTICLE",{class:!0});var p=c(o);l=u(p,"DIV",{class:!0});var q=c(l);r=u(q,"DIV",{}),c(r).forEach(i),b=k(q),a=u(q,"AUDIO",{src:!0}),c(a).forEach(i),T=k(q),I=u(q,"DIV",{}),c(I).forEach(i),q.forEach(i),R=k(p),O=u(p,"SECTION",{}),c(O).forEach(i),F=k(p),s=u(p,"DIV",{class:!0});var M=c(s);d=u(M,"BUTTON",{"data-tooltip":!0});var ae=c(d);m=S(ae,"❌"),ae.forEach(i),C=k(M),f=u(M,"BUTTON",{"data-tooltip":!0});var le=c(f);B=S(le,"🚩"),le.forEach(i),H=k(M),y=u(M,"BUTTON",{"data-tooltip":!0});var oe=c(y);J=S(oe,"⏮"),oe.forEach(i),M.forEach(i),K=k(p),U=u(p,"DIV",{class:!0});var G=c(U);V=u(G,"BUTTON",{"data-tooltip":!0});var se=c(V);P=S(se,"🐢"),se.forEach(i),W=k(G),A=u(G,"BUTTON",{});var x=c(A);Q=S(x,z),X=S(x,"%"),x.forEach(i),Y=k(G),j=u(G,"BUTTON",{"data-tooltip":!0});var ie=c(j);Z=S(ie,"🐇"),ie.forEach(i),G.forEach(i),p.forEach(i),this.h()},h(){a.controls=!0,ne(a.src,h=URL.createObjectURL(t[6]))||v(a,"src",h),v(l,"class","grid"),v(d,"data-tooltip","Reset Flag ("+t[12]("resetFlag")+")"),v(f,"data-tooltip","Flag ("+t[12]("flag")+")"),v(y,"data-tooltip","Go Back ("+t[12]("rewind")+")"),v(s,"class","grid"),v(V,"data-tooltip","Slow Down ("+t[12]("slowDown")+")"),v(j,"data-tooltip","Speed Up ("+t[12]("speedUp")+")"),v(U,"class","grid"),v(o,"class","container")},m(_,p){de(_,o,p),e(o,l),e(l,r),e(l,b),e(l,a),isNaN(t[1])||(a.playbackRate=t[1]),isNaN(t[4])||(a.volume=t[4]),a.muted=t[5],e(l,T),e(l,I),e(o,R),e(o,O),e(o,F),e(o,s),e(s,d),e(d,m),e(s,C),e(s,f),e(f,B),e(s,H),e(s,y),e(y,J),e(o,K),e(o,U),e(U,V),e(V,P),e(U,W),e(U,A),e(A,Q),e(A,X),e(U,Y),e(U,j),e(j,Z),$||(ee=[D(a,"ratechange",t[15]),D(a,"timeupdate",te),D(a,"play",t[17]),D(a,"pause",t[17]),D(a,"volumechange",t[18]),D(d,"click",t[8]),D(f,"click",t[7]),D(y,"click",t[9]),D(V,"click",t[11]),D(j,"click",t[10])],$=!0)},p(_,p){p&64&&!ne(a.src,h=URL.createObjectURL(_[6]))&&v(a,"src",h),p&2&&!isNaN(_[1])&&(a.playbackRate=_[1]),!g&&p&4&&!isNaN(_[2])&&(a.currentTime=_[2]),g=!1,p&8&&w!==(w=_[3])&&a[w?"pause":"play"](),p&16&&!isNaN(_[4])&&(a.volume=_[4]),p&32&&(a.muted=_[5]),p&2&&z!==(z=Math.round(_[1]*10)*10+"")&&ce(Q,z)},d(_){_&&i(o),$=!1,fe(ee)}}}function me(t){let o,l,r,b,a,h,g,E,w,T,I,R,O,F,s=t[6]&&ue(t);return{c(){o=n("div"),l=n("article"),r=n("div"),b=n("div"),a=N(),h=n("input"),g=N(),E=n("div"),w=N(),T=n("div"),I=L(t[6]),R=N(),s&&s.c(),this.h()},l(d){o=u(d,"DIV",{});var m=c(o);l=u(m,"ARTICLE",{class:!0});var C=c(l);r=u(C,"DIV",{class:!0});var f=c(r);b=u(f,"DIV",{}),c(b).forEach(i),a=k(f),h=u(f,"INPUT",{type:!0,accept:!0}),g=k(f),E=u(f,"DIV",{}),c(E).forEach(i),w=k(f),T=u(f,"DIV",{});var B=c(T);I=S(B,t[6]),B.forEach(i),f.forEach(i),C.forEach(i),R=k(m),s&&s.l(m),m.forEach(i),this.h()},h(){v(h,"type","file"),v(h,"accept",".mp3, .ogg, .wav"),v(r,"class","grid"),v(l,"class","container")},m(d,m){de(d,o,m),e(o,l),e(l,r),e(r,b),e(r,a),e(r,h),e(r,g),e(r,E),e(r,w),e(r,T),e(T,I),e(o,R),s&&s.m(o,null),O||(F=[D(h,"change",t[14]),D(o,"keyup",t[13])],O=!0)},p(d,[m]){m&64&&ce(I,d[6]),d[6]?s?s.p(d,m):(s=ue(d),s.c(),s.m(o,null)):s&&(s.d(1),s=null)},i:re,o:re,d(d){d&&i(o),s&&s.d(),O=!1,fe(F)}}}function ge(t){return Object.entries(t).reduce((o,[l,r])=>({...o,v:l}))}function Ee(t,o,l){let r,b,a=0,h=1,g=0,E=!0,w=1,T=!1;const I={flag:()=>a=g,resetFlag:()=>a=0,rewind:()=>l(2,g=a),speedUp:()=>l(1,h+=.1),slowDown:()=>l(1,h-=.1),togglePlayback:()=>l(3,E=!E)},{flag:R,resetFlag:O,rewind:F,speedUp:s,slowDown:d,togglePlayback:m}=I,f=ge({v:"resetFlag",f:"flag",r:"rewind",">":"speedUp","<":"slowDown"," ":"togglePlayback"});function B(P){return f[P]}function H(P){ve.call(this,t,P)}function y(){b=this.files,l(0,b)}function J(){h=this.playbackRate,l(1,h)}function K(){g=this.currentTime,l(2,g)}function U(){E=this.paused,l(3,E)}function V(){w=this.volume,T=this.muted,l(4,w),l(5,T)}return t.$$.update=()=>{t.$$.dirty&1&&l(6,r=b==null?void 0:b[0])},[b,h,g,E,w,T,r,R,O,F,s,d,B,H,y,J,K,U,V]}class Ne extends pe{constructor(o){super(),he(this,o,Ee,me,_e,{})}}export{Ne as default};
