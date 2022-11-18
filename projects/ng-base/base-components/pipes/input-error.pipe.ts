import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'baseInputError',
})
export class InputErrorPipe implements PipeTransform {
  transform(value: any, args: any): any {
    if (Object.keys(value).length > 1 && value.required) {
      delete value.required;
    }
    const errorMessages = {
      required: 'Dieses Feld ist ein Pflichtfeld.',
      email: 'Bitte geben Sie eine gültige E-Mail Adresse an.',
      invalidReference: `${args.inputValue || 'Das'} ist kein gültiger Wert für ${args.label || 'diesen Datentyp'}.`,
    };
    return errorMessages[Object.keys(value)[0]];
  }
}
