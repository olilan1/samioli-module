export function editSkillRoll(html, actor) {
    html.find('.inline-check.with-repost').attr('data-against', 'will');
    
    if (actor.items.find(entry => (entry.system.slug === "acrobatic-performer" && entry.type === "feat"))){
        console.log("Acrobatic Performance detected.")
        let elementToClone = html.find('.inline-check.with-repost');
        let clonedElement = elementToClone.clone();
        clonedElement.attr('data-pf2-check', 'acrobatics');
        clonedElement.find('.label').text('Perform with Acrobatics');
        elementToClone.after(clonedElement)
        elementToClone.after(' or ') 
    }
}