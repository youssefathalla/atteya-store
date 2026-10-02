import { Component, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { form, required, email, minLength } from '@angular/forms/signals';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import { PasswordInputComponent } from '@shared/ui/forms/password-input/password-input.component';
import { SelectInputComponent } from '@shared/ui/forms/select-input/select-input.component';
import { DateInputComponent } from '@shared/ui/forms/date-input/date-input.component';
import { TextFieldInputComponent } from '@shared/ui/forms/text-field-input/text-field-input.component';
import { FileInputComponent } from '@shared/ui/forms/file-input/file-input.component';
import { TimepickerComponent } from '@shared/ui/forms/timepicker/timepicker.component';

@Component({
  selector: 'app-forms-tab',
  imports: [
    JsonPipe,
    MatButtonModule,
    SharedIconModule,
    HorizontalScrollDirective,
    TextInputComponent,
    PasswordInputComponent,
    SelectInputComponent,
    DateInputComponent,
    TextFieldInputComponent,
    FileInputComponent,
    TimepickerComponent,
  ],
  templateUrl: './forms-tab.component.html',
})
export class FormsTabComponent {
  // Signal Form Model & Definition
  protected readonly formModel = signal({
    fullName: 'Alexander Wright',
    email: 'alex.wright@atteya-store.dev',
    password: 'LabSecurePassword!2026',
    role: 'administrator',
    preferredDate: '2026-04-15',
    preferredTime: '14:30',
    bio: 'Lead Systems Architect crafting next-gen Angular Zoneless design systems.',
    file: null as File | null,
  });

  protected readonly demoForm = form(this.formModel, (f) => {
    required(f.fullName, { message: 'Full name is required' });
    required(f.email, { message: 'Email address is required' });
    email(f.email, { message: 'Invalid email address format' });
    required(f.password, { message: 'Password is required' });
    minLength(f.password, 8, { message: 'Password must be at least 8 characters' });
    required(f.role, { message: 'User role must be selected' });
  });

  protected readonly roleOptions = [
    { label: 'Administrator', value: 'administrator' },
    { label: 'Software Engineer', value: 'developer' },
    { label: 'UI/UX Designer', value: 'designer' },
    { label: 'Product Manager', value: 'manager' },
    { label: 'Guest User', value: 'guest' },
  ];

  protected resetForm(): void {
    this.formModel.set({
      fullName: '',
      email: '',
      password: '',
      role: '',
      preferredDate: '',
      preferredTime: '',
      bio: '',
      file: null,
    });
  }

  protected prefillForm(): void {
    this.formModel.set({
      fullName: 'Dr. Sarah Connor',
      email: 'sarah.connor@cyberdyne.io',
      password: 'TerminatorModel101!',
      role: 'administrator',
      preferredDate: '2026-08-29',
      preferredTime: '09:00',
      bio: 'Principal Defense Architect specialized in real-time neural automation.',
      file: null,
    });
  }
}
