(()=>{
const categories=[
{id:'all',name:'전체',subs:[]},
{id:'clothing',name:'의류',subs:[['pullover','풀오버'],['cardigan','가디건'],['vest','베스트'],['top','탑/티'],['dress','원피스/스커트'],['other-clothing','기타 의류']]},
{id:'bag',name:'가방',subs:[['shoulder','숄더백'],['tote','토트백'],['crossbody','크로스백'],['pouch','파우치'],['other-bag','기타 가방']]},
{id:'accessory',name:'패션소품',subs:[['hat','모자'],['scarf','머플러/스카프'],['shawl','숄'],['socks','양말/풋웨어'],['gloves','장갑/워머'],['other-accessory','기타 패션소품']]},
{id:'home',name:'생활소품',subs:[['scrubber','수세미'],['mat','컵받침/매트'],['basket','바구니/수납'],['blanket','쿠션/블랭킷'],['keyring','키링/참'],['other-home','기타 생활소품']]},
{id:'toy',name:'인형/토이',subs:[['doll','인형'],['doll-accessory','인형소품'],['other-toy','기타 토이']]},
{id:'baby',name:'베이비/키즈',subs:[['baby-clothing','의류'],['baby-accessory','소품']]},
{id:'other',name:'기타',subs:[['other','기타']]}
];
const raw=[
['w1','포근한 라운드 가디건','mood_knits',8500,'cardigan',0,'초급','오트밀','clothing','cardigan','대바늘',['S','M','L'],['가을','겨울'],'best-cardigan.png'],
['w2','슬로우 스웨터','haneulknit',9000,'sweater',1,'중급','모스 그린','clothing','pullover','대바늘',['S','M','L'],['가을','겨울'],'best-sweater.png'],
['w3','그레이데이 풀오버','slowknit',10000,'sweater',2,'중급','멀티 컬러','clothing','pullover','대바늘',['S','M','L'],['가을','겨울'],'best-fairisle.png'],
['w4','봄빛 니트탑','dailyyarn',7500,'vest',3,'초급','크림','clothing','top','대바늘',['S','M','L'],['봄','여름'],'best-knit-top.png'],
['w5','마일드 데이 가디건','mood_knits',8500,'cardigan',4,'중급','테라코타','clothing','cardigan','대바늘',['S','M','L'],['가을','겨울'],null],
['w6','케이블 모먼트 베스트','haneulknit',7000,'vest',5,'중급','내추럴','clothing','vest','대바늘',['S','M','L'],['봄','가을'],null],
['w7','노르딕 스웨터','dailyyarn',11000,'sweater',6,'중상급','더스티 블루','clothing','pullover','대바늘',['S','M','L'],['겨울'],null],
['w8','허니 머스타드 가디건','slowknit',9500,'cardigan',7,'초급','머스타드','clothing','cardigan','대바늘',['S','M','L'],['가을','겨울'],null],
['w9','포레스트 데일리 토트','dailyyarn',6000,'bag',8,'초급','모스 그린','bag','tote','코바늘',['FREE'],['봄','여름','가을'],'pattern-bag.png'],
['w10','클래식 리브 비니','mood_knits',4500,'hat',9,'초급','초콜릿','accessory','hat','대바늘',['FREE'],['가을','겨울'],'pattern-beanie.png'],
['w11','윈터 클라우드 머플러','haneulknit',5500,'scarf',10,'초급','더스티 블루','accessory','scarf','대바늘',['FREE'],['가을','겨울'],'pattern-scarf.png'],
['w12','리틀 버니 아미구루미','slowknit',6500,'toy',11,'중급','내추럴','toy','doll','코바늘',['FREE'],['사계절'],'pattern-bunny.png'],
['w13','내추럴 라운드 바스켓','dailyyarn',5000,'basket',12,'초급','오트밀','home','basket','코바늘',['FREE'],['사계절'],'pattern-basket.png'],
['w14','작은 봄 베이비 보넷','mood_knits',5000,'baby',13,'중급','크림','baby','baby-accessory','대바늘',['BABY'],['봄','가을','겨울'],'pattern-baby.png']
];
const works=raw.map((r,i)=>{
 const [id,name,maker,price,type,tile,level,color,category,subcategory,technique,sizes,seasons,image]=r;
 const clothing=category==='clothing';
 const basics=technique==='코바늘'?['사슬뜨기','짧은뜨기','한길긴뜨기']:['코잡기','겉뜨기','안뜨기','코막음'];
 const specifics=type==='cardigan'?['단추 구멍 만들기']:id==='w3'||id==='w7'?['배색뜨기']:id==='w6'?['꽈배기뜨기']:[];
 return {id,name,maker,price,type,tile,level,color,category,subcategory,technique,sizes,seasons,image,tag:clothing?'PATTERN · KIT':'PATTERN',sample:true,
 date:`2026-10-${String(16-i).padStart(2,'0')}`,featured:i%4===0,
 intro:clothing?'매일 손이 가는 편안한 실루엣에, 직접 만드는 따뜻함을 담았어요. 좋아하는 색으로 나만의 일상을 완성해보세요.':'작은 한 코에서 시작되는, 일상에 다정함을 더하는 작품입니다. 나만의 색과 속도로 만드는 즐거움을 만나보세요.',
 yarn:technique==='코바늘'?'MOA 내추럴 코튼':'MOA 소프트 울',composition:technique==='코바늘'?'코튼 100%':'울 80% · 나일론 20%',needles:technique==='코바늘'?'코바늘 6/0호':'대바늘 4.5mm · 5mm',gauge:technique==='코바늘'?'짧은뜨기 18코 × 20단 / 10cm':'메리야스 20코 × 28단 / 10cm',
 amount:clothing?'S 350g · M 400g · L 450g':type==='scarf'?'300g':type==='basket'?'250g':type==='bag'?'200g':'100g',
 tools:technique==='코바늘'?'돗바늘 · 가위 · 단수링':'돗바늘 · 가위 · 단수링 · 줄자',skills:[...basics,...specifics],language:'한국어',format:'PDF 다운로드',
 measures:clothing?[['S','96','54','44'],['M','104','56','46'],['L','112','58','48']]:type==='bag'?[['FREE','30','32','손잡이 24']]:type==='hat'?[['FREE','둘레 54~58','높이 22','—']]:type==='scarf'?[['FREE','폭 24','길이 160','—']]:type==='baby'?[['BABY','둘레 40~44','높이 16','—']]:type==='toy'?[['FREE','폭 12','높이 22','—']]:[['FREE','지름 22','높이 16','—']]
 };
});
for(const w of works){
 if(['w1','w5','w8'].includes(w.id))w.skills=[...w.skills,'꽈배기뜨기','고무뜨기'];
 if(w.id==='w4')w.skills=[...w.skills,'바늘비우기','모아뜨기'];
 w.levelNumber=({'w4':1,'w10':1,'w3':4,'w7':4})[w.id]||({'초급':2,'중급':3,'중상급':4})[w.level]||2;
 w.gaugeConditions={needle:w.technique==='코바늘'?'코바늘 6/0호':'대바늘 5mm',stitch:w.technique==='코바늘'?'짧은뜨기':'메리야스뜨기',finish:'세탁 후 평평하게 건조한 상태',sampleSize:'10 × 10cm'};
 w.structure=w.category==='clothing'?(w.type==='cardigan'?'탑다운 · 앞트임 · 소매 분리':'바텀업 · 몸판과 소매 연결'):w.technique==='코바늘'?'원형뜨기 · 부분 연결':'평면뜨기 · 마무리';
 w.yarnAmounts=w.category==='clothing'?[{size:'S',weight:'350g',skeins:'7볼'},{size:'M',weight:'400g',skeins:'8볼'},{size:'L',weight:'450g',skeins:'9볼'}]:[{size:w.sizes[0],weight:w.amount,skeins:w.type==='scarf'?'6볼':w.type==='basket'?'5볼':w.type==='bag'?'4볼':'2볼'}];
 w.yarnUnit='1볼 50g / 약 100m';
 w.estimatedTime=null;w.videoUrl=null;w.authorNote=null;w.testResults=null;
 w.pdfContents=['작품 소개와 준비물','사이즈별 완성 치수','기호와 주요 사용 기법','단계별 제작 과정','조립 및 마무리 안내'];
 w.galleryRatio=window.MoaGallerySizes?.[w.id]||.75;
 w.gallery=[{kind:'primary',label:'대표 이미지'},{kind:'panel',panel:0,label:'뒷모습 · 반대면'},{kind:'panel',panel:1,label:'스티치 디테일'},{kind:'panel',panel:2,label:'착용 · 스타일링'}];
}
window.MoaCatalog={categories,works};
})();
