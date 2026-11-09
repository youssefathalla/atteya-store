import { Component, inject, input, output, signal, DestroyRef } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { BaseFormControl } from '../base-form-control.directive';
import { GoogleMapsLoaderService } from '@core/services/maps/google-maps-loader.service';
import { LoggerService } from '@core/services/logger/logger.service';

@Component({
  selector: 'app-location-input',
  imports: [MatFormFieldModule, MatInputModule, FormField, SharedIconModule, MatAutocompleteModule],
  host: { class: 'block w-full' },
  templateUrl: './location-input.component.html',
})
export class LocationInputComponent extends BaseFormControl<string> {
  readonly icon = input<string | null>(null);
  readonly disabled = input(false);
  readonly placeSelected = output<google.maps.places.PlaceResult>();
  readonly #mapsService = inject(GoogleMapsLoaderService);
  readonly #destroyRef = inject(DestroyRef);
  readonly #logger = inject(LoggerService);

  readonly predictions = signal<google.maps.places.AutocompleteSuggestion[]>([]);

  #debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.#destroyRef.onDestroy(() => {
      if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
    });
  }

  async ensureMapsLoaded(): Promise<void> {
    if (this.disabled()) return;
    await this.#mapsService.load();
  }

  onInput(event: Event) {
    if (this.disabled()) return;
    const val = (event.target as HTMLInputElement).value;

    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);

    if (!val) {
      this.predictions.set([]);
      return;
    }

    this.#debounceTimer = setTimeout(async () => {
      try {
        await this.ensureMapsLoaded();
        const { AutocompleteSuggestion } = (await google.maps.importLibrary(
          'places',
        )) as google.maps.PlacesLibrary;
        const request: google.maps.places.AutocompleteRequest = {
          input: val,
        };

        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        this.predictions.set(suggestions ?? []);
      } catch (e) {
        this.#logger.error('Error fetching autocomplete suggestions:', e);
        this.predictions.set([]);
      }
    }, 300);
  }

  async onOptionSelected(event: MatAutocompleteSelectedEvent) {
    const address = event.option.value;
    const suggestion = this.predictions().find((s) => s.placePrediction?.text?.text === address);

    if (suggestion?.placePrediction) {
      try {
        // Use toPlace() for proper session token billing
        const place = suggestion.placePrediction.toPlace();

        await place.fetchFields({
          fields: ['formattedAddress', 'location', 'displayName'],
        });

        // Emit a PlaceResult-compatible structure for DistanceService
        this.placeSelected.emit({
          formatted_address: place.formattedAddress,
          name: place.displayName,
          geometry: {
            location: place.location,
          } as google.maps.places.PlaceGeometry,
        } as google.maps.places.PlaceResult);
      } catch (error) {
        this.#logger.error('Error fetching place details:', error);
      }
    }
  }
}
