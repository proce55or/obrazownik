import type { Attempt } from '../shared/schemas';
export function AboutExercise({attempt}:{attempt:Attempt}){
 const method=attempt.methodSnapshot;
 const labels={clinical_adaptation:'Adaptacja inspirowana metodą kliniczną',experimental_inspiration:'Inspiracja badawcza lub projektowa',linguistic_resource:'Zasób językowy',creative_hypothesis:'Autorskie ćwiczenie twórcze'};
 return <details className="versions about-exercise"><summary>O ćwiczeniu i jego podstawach</summary>{method?<><h3>{method.title}</h3><p>{labels[method.basisType]}</p><p>{method.adaptationNote}</p><p>Ta polska wersja aplikacji nie została zwalidowana naukowo. Wyniki badań metod nie są dowodem skuteczności Obrazownika.</p><p className="fine-print">{method.contentOrigin} {method.licenseStatus}</p>{method.sourceLinks.map(link=><p key={link.url}><a href={link.url} target="_blank" rel="noreferrer noopener">{link.label} ↗</a></p>)}</>:<p>W starszej wersji nie zapisano pochodzenia tej metody. Nie uzupełniamy go na podstawie domysłu.</p>}</details>;
}
