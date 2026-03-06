declare module "intl-tel-input/build/js/utils.js" {
  interface IntlTelInputUtils {
    isValidNumber(number: string, countryCode: string): boolean
    isPossibleNumber(number: string, countryCode: string, numberTypes?: string): boolean
    formatNumber(number: string, countryCode: string, format: number): string
    getValidationError(number: string, countryCode: string): number
    getNumberType(number: string, countryCode: string): number
    getExampleNumber(countryCode: string, isNational: boolean, numberType: number, useE164?: boolean): string
    getCoreNumber(number: string, countryCode: string): string
    numberFormat: {
      E164: 0
      INTERNATIONAL: 1
      NATIONAL: 2
      RFC3966: 3
    }
    numberType: Record<string, number>
    validationError: {
      IS_POSSIBLE: 0
      INVALID_COUNTRY_CODE: 1
      TOO_SHORT: 2
      TOO_LONG: 3
      IS_POSSIBLE_LOCAL_ONLY: 4
      INVALID_LENGTH: 5
    }
  }

  const utils: IntlTelInputUtils
  export default utils
}
