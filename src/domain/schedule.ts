export function localDay(now:Date,timezone:string):string{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=(type:string)=>parts.find(p=>p.type===type)!.value;return `${value('year')}-${value('month')}-${value('day')}`;
}
export function addCalendarDays(day:string,offset:number):string{
 const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);
}
export function choose<T>(items:T[],random:()=>number=Math.random):T|undefined {if(!items.length)return undefined;const value=random();if(value<0||value>=1||!Number.isFinite(value))throw new Error('Niepoprawne źródło losowania.');return items[Math.floor(value*items.length)];}
