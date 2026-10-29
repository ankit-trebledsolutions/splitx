import React, { useEffect, useMemo, useState } from 'react';
import SearchSelectField from './SearchSelectField';
import { loadCountries, loadStates } from '../data/regions';
import { flagOf } from '../utils/tripFlag';

/**
 * Where a trip is going: a Country field, then a State field that offers only
 * that country's states. Both lists come from the server and are kept on the
 * phone (data/regions.js). The value is { countryCode, stateCode }, with
 * either empty while nothing is picked; changing the country clears the state.
 *
 * `errors`: { countryCode?, stateCode? } messages under each field.
 */
const DestinationFields = ({ value, onChange, errors = {}, stateRequired = false }) => {
  const countryCode = value?.countryCode ?? '';
  const stateCode = value?.stateCode ?? '';
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingStates, setLoadingStates] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCountries()
      .then((list) => alive && setCountries(list))
      .catch(() => {})
      .finally(() => alive && setLoadingCountries(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setStates([]);
    if (!countryCode) return undefined;
    let alive = true;
    setLoadingStates(true);
    loadStates(countryCode)
      .then((list) => alive && setStates(list))
      .catch(() => {})
      .finally(() => alive && setLoadingStates(false));
    return () => {
      alive = false;
    };
  }, [countryCode]);

  const countryOptions = useMemo(
    () => countries.map((country) => ({ value: country.code, label: country.name, flag: flagOf(country.code) })),
    [countries]
  );
  const stateOptions = useMemo(() => states.map((state) => ({ value: state.code, label: state.name })), [states]);
  const country = countries.find((candidate) => candidate.code === countryCode);

  return (
    <>
      <SearchSelectField
        label="Country"
        value={countryCode}
        options={countryOptions}
        loading={loadingCountries}
        onChange={(code) => onChange?.({ countryCode: code, stateCode: '' })}
        placeholder="Pick a country"
        searchPlaceholder="Type a country name"
        emptyText="No country by that name"
        error={errors.countryCode}
      />
      <SearchSelectField
        label={stateRequired ? 'State' : 'State (optional)'}
        value={stateCode}
        options={stateOptions}
        loading={loadingStates}
        disabled={!countryCode}
        disabledHint="Pick a country first"
        onChange={(code) => onChange?.({ countryCode, stateCode: code })}
        placeholder={country ? `Pick a state in ${country.name}` : 'Pick a state'}
        searchPlaceholder="Type a state name"
        emptyText={country ? `No state in ${country.name} by that name` : 'Nothing matches'}
        error={errors.stateCode}
      />
    </>
  );
};

export default DestinationFields;
